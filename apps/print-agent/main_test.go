package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakePrinter struct {
	jobs []printerJob
	err  error
}

func (printer *fakePrinter) Print(_ context.Context, job printerJob) (int, error) {
	printer.jobs = append(printer.jobs, job)
	return 1, printer.err
}

func validPrintRequest() printRequest {
	return printRequest{
		DispatchID:  "dispatch-1",
		OrderID:     "00000000-0000-4000-8000-000000000001",
		OrderNumber: 42,
		Summary: receiptSummary{
			Subtotal:         50,
			DeliveryFee:      15,
			Total:            65,
			DeliveryAreaName: "MIR 1",
		},
		Jobs: []printerJob{{
			PrinterIP: "192.168.123.100",
			Items: []printItem{{
				ID:        "00000000-0000-4000-8000-000000000011",
				Name:      "TEST DISH",
				Quantity:  2,
				UnitPrice: 25,
			}},
		}},
		UnassignedItems: []printItem{},
	}
}

func TestFormatJobUsesLargeTextSeparatorsAndBoundedHexChunks(t *testing.T) {
	chunks := formatJobChunks(42, []printItem{
		{ID: "1", Name: "FIRST DISH", Quantity: 2, UnitPrice: 25},
		{ID: "2", Name: "SECOND DISH", Quantity: 1, UnitPrice: 40},
	}, receiptSummary{Subtotal: 90, DeliveryFee: 15, Total: 105, DeliveryAreaName: "MIR 1"})
	if len(chunks) == 0 {
		t.Fatal("expected at least one print chunk")
	}
	for _, chunk := range chunks {
		if len(chunk) > maxRawChunkBytes {
			t.Fatalf("chunk is too large: %d", len(chunk))
		}
		if !bytes.Contains(chunk, []byte{0x1d, 0x21, 0x11}) {
			t.Fatal("large text command is missing")
		}
		if !bytes.Contains(chunk, []byte("------------------------")) {
			t.Fatal("item separator is missing")
		}
		if !bytes.Contains(chunk, []byte("QTY: 2")) && !bytes.Contains(chunk, []byte("QTY: 1")) {
			t.Fatal("quantity is missing")
		}
		if !bytes.Contains(chunk, []byte("ONLINE ORDER")) || !bytes.Contains(chunk, []byte("#42")) {
			t.Fatal("online order number is missing")
		}
		if !bytes.Contains(chunk, []byte("DELIVERY: 15.00")) || !bytes.Contains(chunk, []byte("TOTAL: 105.00")) {
			t.Fatal("delivery price or order total is missing")
		}
		if len(spacedHex(chunk)) > 1024 {
			t.Fatal("J-Speed hexadecimal form payload is too large")
		}
		if !bytes.HasPrefix(chunk, []byte{0x1b, 0x40, 0x1b, 0x61, 0x00, '\n', '\n'}) {
			t.Fatal("top paper padding is missing")
		}
		if !bytes.HasSuffix(chunk, []byte{'\n', '\n', '\n', '\n', '\n', 0x1d, 0x56, 0x00}) {
			t.Fatal("bottom paper padding before the cut is missing")
		}
	}
}

func TestPrintRequestRejectsPublicAndDuplicateAddresses(t *testing.T) {
	payload := validPrintRequest()
	payload.Jobs[0].PrinterIP = "8.8.8.8"
	if err := validatePrintRequest(payload); err == nil {
		t.Fatal("expected public IP to be rejected")
	}

	payload = validPrintRequest()
	payload.Jobs = append(payload.Jobs, payload.Jobs[0])
	if err := validatePrintRequest(payload); err == nil {
		t.Fatal("expected duplicate printer IP to be rejected")
	}
}

func TestAgentAllowsOnlyConfiguredBrowserOrigin(t *testing.T) {
	printer := &fakePrinter{}
	handler := newAgentServer([]string{"https://a7-tagam.com.tm"}, printer)
	payload, _ := json.Marshal(validPrintRequest())

	denied := httptest.NewRequest(http.MethodPost, "/v1/print", bytes.NewReader(payload))
	denied.Header.Set("Origin", "https://evil.example")
	denied.Header.Set("Content-Type", "application/json")
	deniedResponse := httptest.NewRecorder()
	handler.ServeHTTP(deniedResponse, denied)
	if deniedResponse.Code != http.StatusForbidden {
		t.Fatalf("unexpected denied status: %d", deniedResponse.Code)
	}

	preflight := httptest.NewRequest(http.MethodOptions, "/v1/print", nil)
	preflight.Header.Set("Origin", "https://a7-tagam.com.tm")
	preflightResponse := httptest.NewRecorder()
	handler.ServeHTTP(preflightResponse, preflight)
	if preflightResponse.Code != http.StatusNoContent {
		t.Fatalf("unexpected preflight status: %d", preflightResponse.Code)
	}
	if preflightResponse.Header().Get("Access-Control-Allow-Private-Network") != "true" {
		t.Fatal("private network preflight header is missing")
	}

	allowed := httptest.NewRequest(http.MethodPost, "/v1/print", bytes.NewReader(payload))
	allowed.Header.Set("Origin", "https://a7-tagam.com.tm")
	allowed.Header.Set("Content-Type", "application/json")
	allowedResponse := httptest.NewRecorder()
	handler.ServeHTTP(allowedResponse, allowed)
	if allowedResponse.Code != http.StatusOK {
		t.Fatalf("unexpected print status: %d: %s", allowedResponse.Code, allowedResponse.Body.String())
	}
	if len(printer.jobs) != 1 || printer.jobs[0].PrinterIP != "192.168.123.100" {
		t.Fatalf("unexpected jobs: %#v", printer.jobs)
	}
	if printer.jobs[0].OrderNumber != 42 {
		t.Fatalf("online order number was not forwarded: %#v", printer.jobs[0])
	}
}

func TestJSpeedClientAcceptsLegacyHTTP09Response(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	requestTarget := make(chan string, 1)
	go func() {
		connection, acceptErr := listener.Accept()
		if acceptErr != nil {
			return
		}
		defer connection.Close()
		reader := bufio.NewReader(connection)
		line, _ := reader.ReadString('\n')
		requestTarget <- line
		for {
			header, readErr := reader.ReadString('\n')
			if readErr != nil || header == "\r\n" {
				break
			}
		}
		_, _ = io.WriteString(connection, "<!DOCTYPE HTML><HTML><BODY>Print Content</BODY></HTML>")
	}()

	port := strings.Split(listener.Addr().String(), ":")
	client := &jspeedPrinter{
		port:        port[len(port)-1],
		dialTimeout: time.Second,
		ioTimeout:   time.Second,
	}
	if err := client.send(context.Background(), "127.0.0.1", []byte("TEST")); err != nil {
		t.Fatal(err)
	}
	line := <-requestTarget
	if !strings.Contains(line, "/prt_test.htm?") || !strings.Contains(line, "hex_mode=on") {
		t.Fatalf("unexpected request line: %s", line)
	}
}
