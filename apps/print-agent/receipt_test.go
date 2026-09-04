package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/image/font/sfnt"
)

func previewJob(t *testing.T) printerJob {
	t.Helper()
	data, err := os.ReadFile("testdata/receipt.json")
	if err != nil {
		t.Fatal(err)
	}
	var request printRequest
	if err := json.Unmarshal(data, &request); err != nil {
		t.Fatal(err)
	}
	if err := validatePrintRequest(request); err != nil {
		t.Fatal(err)
	}
	job := request.Jobs[0]
	job.OrderNumber, job.Metadata, job.Summary = request.OrderNumber, request.Metadata, request.Summary
	return job
}

func TestRasterPacketsPreserveEveryPixelAndCutOnlyOnce(t *testing.T) {
	bitmap, err := renderReceipt(previewJob(t))
	if err != nil {
		t.Fatal(err)
	}
	for _, limit := range []int{330, 8 + 72*128} {
		packets := receiptRasterPackets(bitmap, limit)
		if !bytes.Equal(packets[0], []byte{0x1b, 0x40, 0x1b, 0x61, 0}) {
			t.Fatal("missing single initialization")
		}
		if !bytes.Equal(packets[len(packets)-1], []byte{0x1b, 0x64, 3, 0x1d, 0x56, 0}) {
			t.Fatal("missing single final feed/cut")
		}
		decoded := image.NewGray(bitmap.Bounds())
		draw.Draw(decoded, decoded.Bounds(), image.White, image.Point{}, draw.Src)
		y := 0
		for _, packet := range packets[1 : len(packets)-1] {
			if len(packet) > limit {
				t.Fatalf("oversized packet: %d > %d", len(packet), limit)
			}
			if !bytes.Equal(packet[:4], []byte{0x1d, 0x76, 0x30, 0}) {
				t.Fatal("unexpected command inside image")
			}
			width := int(packet[4]) + int(packet[5])*256
			height := int(packet[6]) + int(packet[7])*256
			if width != 72 || len(packet) != 8+width*height {
				t.Fatal("invalid raster dimensions")
			}
			for row := 0; row < height; row++ {
				for x := 0; x < width*8; x++ {
					if packet[8+row*width+x/8]&(0x80>>uint(x%8)) != 0 {
						decoded.SetGray(x, y+row, color.Gray{Y: 0})
					}
				}
			}
			y += height
		}
		if y != bitmap.Bounds().Dy() || !bytes.Equal(decoded.Pix, bitmap.Pix) {
			t.Fatal("transport lost, duplicated, or reordered receipt pixels")
		}
	}
}

func TestReceiptFontSupportsRussianAndTurkmenWithoutCodePages(t *testing.T) {
	canvas, err := newReceiptCanvas()
	if err != nil {
		t.Fatal(err)
	}
	for _, parsed := range []*sfnt.Font{canvas.regular, canvas.bold} {
		for _, r := range "НаименованиеКоличествоЦенаСуммаЁёÄäÇçŇňÖöŞşÜüÝýŽž" {
			index, err := parsed.GlyphIndex(nil, r)
			if err != nil || index == 0 {
				t.Fatalf("missing glyph %q", r)
			}
		}
	}
}

func TestReceiptWrapsCompleteLongNamesAndCancellationReasons(t *testing.T) {
	canvas, err := newReceiptCanvas()
	if err != nil {
		t.Fatal(err)
	}
	face := canvas.face(21, false)
	defer face.Close()
	name := "Пицца · Большая — öý tagamy " + strings.Repeat("ö", 100)
	lines := receiptLines(name, face, 222)
	if strings.ReplaceAll(strings.Join(lines, ""), " ", "") != strings.ReplaceAll(name, " ", "") {
		t.Fatal("receipt truncated the dish name")
	}
	job := previewJob(t)
	job.DocumentType, job.CancellationReason = documentTypeCancel, strings.Repeat("Причина отмены. ", 25)
	job.Items[0].Name = name
	bitmap, err := renderReceipt(job)
	if err != nil {
		t.Fatal(err)
	}
	plain, _ := renderReceipt(previewJob(t))
	if bitmap.Bounds().Dy() <= plain.Bounds().Dy() {
		t.Fatal("long text did not extend the receipt")
	}
}

func TestJSpeedPrintsOneContinuousReceiptAndSerializesConcurrentOrders(t *testing.T) {
	var mu sync.Mutex
	var received []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		chunk, err := hex.DecodeString(strings.ReplaceAll(r.URL.Query().Get("content"), " ", ""))
		if err != nil || len(chunk) > maxRawChunkBytes {
			t.Error("invalid J-Speed packet")
			w.WriteHeader(400)
			return
		}
		mu.Lock()
		received = append(received, chunk...)
		mu.Unlock()
		_, _ = w.Write([]byte("Print Content"))
	}))
	defer server.Close()
	host, portText, _ := net.SplitHostPort(strings.TrimPrefix(server.URL, "http://"))
	port, _ := strconv.Atoi(portText)
	first := previewJob(t)
	first.Transport, first.PrinterIP, first.PrinterPort = transportJSpeedHTTP, host, port
	second := first
	second.OrderNumber++
	want := func(job printerJob) []byte {
		bitmap, err := renderReceipt(job)
		if err != nil {
			t.Fatal(err)
		}
		return bytes.Join(receiptRasterPackets(bitmap, 330), nil)
	}
	firstBytes, secondBytes := want(first), want(second)
	client := &lanPrinter{dialTimeout: time.Second, ioTimeout: time.Second}
	var wg sync.WaitGroup
	for _, job := range []printerJob{first, second} {
		wg.Go(func() {
			if _, err := client.Print(context.Background(), job); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	mu.Lock()
	defer mu.Unlock()
	if !bytes.Equal(received, bytes.Join([][]byte{firstBytes, secondBytes}, nil)) && !bytes.Equal(received, bytes.Join([][]byte{secondBytes, firstBytes}, nil)) {
		t.Fatal("concurrent orders interleaved or lost receipt data")
	}
}

func TestReceiptMetadataIsOptionalAndBounded(t *testing.T) {
	request := validPrintRequest()
	if err := validatePrintRequest(request); err != nil {
		t.Fatal("legacy request rejected", err)
	}
	request.Metadata = &receiptMetadata{CreatedAt: "not-a-date"}
	if validatePrintRequest(request) == nil {
		t.Fatal("invalid date accepted")
	}
	request.Metadata = &receiptMetadata{CustomerNote: strings.Repeat("x", 501)}
	if validatePrintRequest(request) == nil {
		t.Fatal("unbounded comment accepted")
	}
	request.Metadata = nil
	request.Jobs[0].CopyType = "OTHER"
	if validatePrintRequest(request) == nil {
		t.Fatal("unsupported copy accepted")
	}
}

func TestKitchenCopyOmitsCustomerIdentityAndAddress(t *testing.T) {
	job := previewJob(t)
	job.CopyType = "KITCHEN"
	before, err := renderReceipt(job)
	if err != nil {
		t.Fatal(err)
	}
	job.Metadata.CustomerName = "Другой клиент"
	job.Metadata.CustomerPhone = "+99365000999"
	job.Metadata.Address = "Другой адрес"
	job.Metadata.AddressDetails = "Кв.: 99"
	after, err := renderReceipt(job)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before.Pix, after.Pix) {
		t.Fatal("customer identity leaked into the kitchen copy")
	}
	job.CopyType = "MAIN"
	main, err := renderReceipt(job)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(main.Pix, before.Pix) {
		t.Fatal("main receipt lost its customer details")
	}
}
