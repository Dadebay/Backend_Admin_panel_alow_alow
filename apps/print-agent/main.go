package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	defaultListenAddress = "127.0.0.1:17873"
	maxRequestBytes      = 1 << 20
	maxRawChunkBytes     = 330
	topPaddingLines      = 2
	bottomPaddingLines   = 5
	transportRawTCP      = "RAW_TCP"
	transportJSpeedHTTP  = "JSPEED_HTTP"
	documentTypeOrder    = "ORDER"
	documentTypeCancel   = "CANCELLATION"
)

var version = "dev"

type printItem struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unitPrice"`
}

type printerJob struct {
	PrinterIP          string         `json:"printerIp"`
	PrinterPort        int            `json:"printerPort"`
	Transport          string         `json:"transport"`
	Items              []printItem    `json:"items"`
	OrderNumber        int            `json:"-"`
	DocumentType       string         `json:"-"`
	CancellationReason string         `json:"-"`
	Summary            receiptSummary `json:"-"`
}

type receiptSummary struct {
	Subtotal         float64 `json:"subtotal"`
	Discount         float64 `json:"discount"`
	DeliveryFee      float64 `json:"deliveryFee"`
	Total            float64 `json:"total"`
	DeliveryAreaName string  `json:"deliveryAreaName"`
}

type printRequest struct {
	DispatchID         string         `json:"dispatchId"`
	OrderID            string         `json:"orderId"`
	OrderNumber        int            `json:"orderNumber"`
	DocumentType       string         `json:"documentType"`
	CancellationReason string         `json:"cancellationReason"`
	Summary            receiptSummary `json:"summary"`
	Jobs               []printerJob   `json:"jobs"`
	UnassignedItems    []printItem    `json:"unassignedItems"`
}

type printedPrinter struct {
	PrinterIP   string `json:"printerIp"`
	PrinterPort int    `json:"printerPort"`
	Transport   string `json:"transport"`
	Chunks      int    `json:"chunks"`
}

type failedPrinter struct {
	PrinterIP   string `json:"printerIp"`
	PrinterPort int    `json:"printerPort"`
	Transport   string `json:"transport"`
	Message     string `json:"message"`
}

type printResponse struct {
	OrderID     string           `json:"orderId"`
	OrderNumber int              `json:"orderNumber"`
	Printed     []printedPrinter `json:"printed"`
	Failed      []failedPrinter  `json:"failed"`
	Message     string           `json:"message,omitempty"`
}

type jobPrinter interface {
	Print(context.Context, printerJob) (int, error)
}

type lanPrinter struct {
	dialTimeout time.Duration
	ioTimeout   time.Duration
}

type agentServer struct {
	allowedOrigins map[string]struct{}
	printer        jobPrinter
}

func main() {
	listenAddress := flag.String("listen", defaultListenAddress, "loopback address for the browser bridge")
	origins := flag.String(
		"origins",
		"https://a7-tagam.com.tm,http://localhost:5173,http://127.0.0.1:5173",
		"comma-separated admin origins allowed to call the agent",
	)
	showVersion := flag.Bool("version", false, "print the agent version")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		return
	}
	host, _, err := net.SplitHostPort(*listenAddress)
	if err != nil || (host != "127.0.0.1" && host != "localhost" && host != "::1") {
		log.Fatal("--listen must bind to a loopback address")
	}

	handler := newAgentServer(strings.Split(*origins, ","), &lanPrinter{
		dialTimeout: 3 * time.Second,
		ioTimeout:   8 * time.Second,
	})
	server := &http.Server{
		Addr:              *listenAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       30 * time.Second,
	}

	shutdownContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-shutdownContext.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	log.Printf("A7-tagam print agent %s listening on http://%s", version, *listenAddress)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func newAgentServer(origins []string, printer jobPrinter) http.Handler {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		if normalized := strings.TrimSpace(origin); normalized != "" {
			allowed[normalized] = struct{}{}
		}
	}
	return &agentServer{allowedOrigins: allowed, printer: printer}
}

func (server *agentServer) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	switch request.URL.Path {
	case "/health":
		if origin := request.Header.Get("Origin"); origin != "" {
			if !server.allowOrigin(writer, origin) {
				writeJSON(writer, http.StatusForbidden, map[string]string{"message": "Origin is not allowed"})
				return
			}
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok", "version": version})
	case "/v1/print":
		origin := request.Header.Get("Origin")
		if !server.allowOrigin(writer, origin) {
			writeJSON(writer, http.StatusForbidden, map[string]string{"message": "Origin is not allowed"})
			return
		}
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		if request.Method != http.MethodPost {
			writer.Header().Set("Allow", "POST, OPTIONS")
			writeJSON(writer, http.StatusMethodNotAllowed, map[string]string{"message": "Method is not allowed"})
			return
		}
		server.print(writer, request)
	default:
		writeJSON(writer, http.StatusNotFound, map[string]string{"message": "Not found"})
	}
}

func (server *agentServer) allowOrigin(writer http.ResponseWriter, origin string) bool {
	if _, ok := server.allowedOrigins[origin]; !ok || origin == "" {
		return false
	}
	writer.Header().Set("Access-Control-Allow-Origin", origin)
	writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	writer.Header().Set("Access-Control-Allow-Private-Network", "true")
	writer.Header().Set("Access-Control-Max-Age", "600")
	writer.Header().Set("Vary", "Origin")
	return true
}

func (server *agentServer) print(writer http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var payload printRequest
	if err := decoder.Decode(&payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"message": "Invalid print request"})
		return
	}
	if err := validatePrintRequest(payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}

	response := printResponse{
		OrderID:     payload.OrderID,
		OrderNumber: payload.OrderNumber,
		Printed:     make([]printedPrinter, 0, len(payload.Jobs)),
		Failed:      make([]failedPrinter, 0),
	}
	for _, job := range payload.Jobs {
		job = normalizePrinterJob(job)
		job.OrderNumber = payload.OrderNumber
		job.DocumentType = normalizeDocumentType(payload.DocumentType)
		job.CancellationReason = strings.TrimSpace(payload.CancellationReason)
		job.Summary = payload.Summary
		chunks, err := server.printer.Print(request.Context(), job)
		if err != nil {
			response.Failed = append(response.Failed, failedPrinter{
				PrinterIP:   job.PrinterIP,
				PrinterPort: job.PrinterPort,
				Transport:   job.Transport,
				Message:     err.Error(),
			})
			continue
		}
		response.Printed = append(response.Printed, printedPrinter{
			PrinterIP:   job.PrinterIP,
			PrinterPort: job.PrinterPort,
			Transport:   job.Transport,
			Chunks:      chunks,
		})
	}
	if len(response.Failed) > 0 {
		response.Message = "Не все чековые аппараты приняли печать"
		writeJSON(writer, http.StatusBadGateway, response)
		return
	}
	writeJSON(writer, http.StatusOK, response)
}

func validatePrintRequest(payload printRequest) error {
	if strings.TrimSpace(payload.DispatchID) == "" || strings.TrimSpace(payload.OrderID) == "" || payload.OrderNumber < 1 {
		return errors.New("Missing order print identity")
	}
	if len(payload.Jobs) == 0 || len(payload.Jobs) > 51 {
		return errors.New("Print request must contain between 1 and 51 printer jobs")
	}
	if documentType := normalizeDocumentType(payload.DocumentType); documentType != documentTypeOrder && documentType != documentTypeCancel {
		return errors.New("Print request has an unsupported document type")
	}
	if len([]rune(payload.CancellationReason)) > 500 {
		return errors.New("Cancellation reason is too long")
	}
	if payload.Summary.Subtotal < 0 || payload.Summary.Subtotal > 1_000_000 ||
		payload.Summary.Discount < 0 || payload.Summary.Discount > payload.Summary.Subtotal ||
		payload.Summary.DeliveryFee < 0 || payload.Summary.DeliveryFee > 1_000_000 ||
		payload.Summary.Total < 0 || payload.Summary.Total > 1_000_000 ||
		math.Abs(payload.Summary.Total-(payload.Summary.Subtotal-payload.Summary.Discount+payload.Summary.DeliveryFee)) > 0.011 {
		return errors.New("Receipt summary is invalid")
	}
	for _, job := range payload.Jobs {
		normalized := normalizePrinterJob(job)
		if !isPrivateIPv4(normalized.PrinterIP) {
			return fmt.Errorf("Printer %q is not a private IPv4 address", job.PrinterIP)
		}
		if normalized.PrinterPort < 1 || normalized.PrinterPort > 65535 {
			return fmt.Errorf("Printer %q has an invalid port", job.PrinterIP)
		}
		if normalized.Transport != transportRawTCP && normalized.Transport != transportJSpeedHTTP {
			return fmt.Errorf("Printer %q has an unsupported transport", job.PrinterIP)
		}
		if len(job.Items) == 0 || len(job.Items) > 50 {
			return fmt.Errorf("Printer %q must contain between 1 and 50 items", job.PrinterIP)
		}
		for _, item := range job.Items {
			if strings.TrimSpace(item.ID) == "" || strings.TrimSpace(item.Name) == "" {
				return errors.New("Every print item must have an ID and name")
			}
			if item.Quantity < 1 || item.Quantity > 50 || item.UnitPrice < 0 || item.UnitPrice > 1_000_000 {
				return fmt.Errorf("Print item %q has invalid quantity or price", item.Name)
			}
		}
	}
	return nil
}

func normalizePrinterJob(job printerJob) printerJob {
	if job.Transport == "" {
		job.Transport = transportJSpeedHTTP
	}
	if job.PrinterPort == 0 {
		if job.Transport == transportRawTCP {
			job.PrinterPort = 9100
		} else {
			job.PrinterPort = 80
		}
	}
	return job
}

func normalizeDocumentType(value string) string {
	if value == "" {
		return documentTypeOrder
	}
	return value
}

func isPrivateIPv4(value string) bool {
	ip := net.ParseIP(value)
	return ip != nil && ip.To4() != nil && ip.IsPrivate()
}

func (printer *lanPrinter) Print(ctx context.Context, job printerJob) (int, error) {
	chunks := formatJobChunks(
		job.OrderNumber,
		job.Items,
		job.Summary,
		job.DocumentType,
		job.CancellationReason,
	)
	for _, chunk := range chunks {
		var err error
		switch job.Transport {
		case transportRawTCP:
			err = printer.sendRaw(ctx, job.PrinterIP, job.PrinterPort, chunk)
		case transportJSpeedHTTP:
			err = printer.sendJSpeed(ctx, job.PrinterIP, job.PrinterPort, chunk)
		default:
			err = errors.New("неподдерживаемый режим подключения")
		}
		if err != nil {
			return 0, fmt.Errorf("%s:%d: %w", job.PrinterIP, job.PrinterPort, err)
		}
	}
	return len(chunks), nil
}

func (printer *lanPrinter) dial(ctx context.Context, printerIP string, printerPort int) (net.Conn, error) {
	dialer := net.Dialer{Timeout: printer.dialTimeout}
	connection, err := dialer.DialContext(
		ctx,
		"tcp4",
		net.JoinHostPort(printerIP, strconv.Itoa(printerPort)),
	)
	if err != nil {
		return nil, errors.New("нет соединения по LAN")
	}
	deadline := time.Now().Add(printer.ioTimeout)
	if contextDeadline, ok := ctx.Deadline(); ok && contextDeadline.Before(deadline) {
		deadline = contextDeadline
	}
	_ = connection.SetDeadline(deadline)
	return connection, nil
}

func (printer *lanPrinter) sendRaw(ctx context.Context, printerIP string, printerPort int, payload []byte) error {
	connection, err := printer.dial(ctx, printerIP, printerPort)
	if err != nil {
		return err
	}
	defer connection.Close()
	if _, err := connection.Write(payload); err != nil {
		return errors.New("не удалось отправить данные")
	}
	if tcpConnection, ok := connection.(*net.TCPConn); ok {
		_ = tcpConnection.CloseWrite()
	}
	return nil
}

func (printer *lanPrinter) sendJSpeed(ctx context.Context, printerIP string, printerPort int, payload []byte) error {
	query := url.Values{}
	query.Set("content", spacedHex(payload))
	query.Set("hex_mode", "on")
	query.Set("Send", "Print Test")
	target := "/prt_test.htm?" + query.Encode()

	connection, err := printer.dial(ctx, printerIP, printerPort)
	if err != nil {
		return err
	}
	defer connection.Close()
	request := fmt.Sprintf("GET %s HTTP/1.0\r\nHost: %s\r\nConnection: close\r\n\r\n", target, printerIP)
	if _, err := io.WriteString(connection, request); err != nil {
		return errors.New("не удалось отправить данные")
	}
	if tcpConnection, ok := connection.(*net.TCPConn); ok {
		_ = tcpConnection.CloseWrite()
	}
	response, readErr := io.ReadAll(io.LimitReader(connection, 16<<10))
	if len(response) == 0 {
		if readErr != nil {
			return errors.New("аппарат не ответил")
		}
		return errors.New("аппарат вернул пустой ответ")
	}
	if bytes.HasPrefix(response, []byte("HTTP/")) {
		fields := strings.Fields(string(response[:min(len(response), 64)]))
		if len(fields) > 1 {
			status, _ := strconv.Atoi(fields[1])
			if status < 200 || status >= 300 {
				return fmt.Errorf("аппарат вернул HTTP %d", status)
			}
		}
	}
	if !bytes.Contains(response, []byte("Print Content")) {
		return errors.New("аппарат не подтвердил задание")
	}
	return nil
}

func formatJobChunks(orderNumber int, items []printItem, summary receiptSummary, documentType string, cancellationReason string) [][]byte {
	chunks := make([][]byte, 0, len(items))
	current := make([]printItem, 0, len(items))
	for _, item := range items {
		candidate := append(append([]printItem(nil), current...), item)
		if len(formatReceipt(orderNumber, candidate, summary, documentType, cancellationReason)) > maxRawChunkBytes && len(current) > 0 {
			chunks = append(chunks, formatReceipt(orderNumber, current, summary, documentType, cancellationReason))
			current = []printItem{item}
			continue
		}
		current = candidate
	}
	if len(current) > 0 {
		chunks = append(chunks, formatReceipt(orderNumber, current, summary, documentType, cancellationReason))
	}
	return chunks
}

func formatReceipt(orderNumber int, items []printItem, summary receiptSummary, documentType string, cancellationReason string) []byte {
	payload := []byte{0x1b, 0x40, 0x1b, 0x61, 0x00}
	payload = append(payload, bytes.Repeat([]byte{'\n'}, topPaddingLines)...)
	payload = append(payload, 0x1b, 0x61, 0x01)
	header := "ONLINE ORDER"
	if normalizeDocumentType(documentType) == documentTypeCancel {
		header = "CANCELLED ORDER"
	}
	payload = appendLargeLine(payload, header)
	payload = appendLargeLine(payload, fmt.Sprintf("#%d", orderNumber))
	payload = append(payload, []byte("========================\n")...)
	payload = append(payload, 0x1b, 0x61, 0x00)
	if normalizeDocumentType(documentType) == documentTypeCancel && strings.TrimSpace(cancellationReason) != "" {
		reason := truncateRunes(strings.Join(strings.Fields(cancellationReason), " "), 16)
		payload = appendLargeLine(payload, "REASON: "+reason)
		payload = append(payload, []byte("========================\n")...)
	}
	for _, item := range items {
		name := truncateRunes(strings.Join(strings.Fields(item.Name), " "), 48)
		for _, line := range wrapRunes(name, 24) {
			payload = appendLargeLine(payload, line)
		}
		payload = append(payload, []byte("------------------------\n")...)
		payload = appendLargeLine(payload, fmt.Sprintf("QTY: %d", item.Quantity))
		payload = appendLargeLine(payload, fmt.Sprintf("PRICE: %.2f", item.UnitPrice))
		payload = append(payload, []byte("------------------------\n")...)
	}
	payload = appendLargeLine(payload, fmt.Sprintf("SUBTOTAL: %.2f", summary.Subtotal))
	if summary.Discount > 0 {
		payload = appendLargeLine(payload, fmt.Sprintf("DISCOUNT: %.2f", summary.Discount))
	}
	payload = appendLargeLine(payload, fmt.Sprintf("DELIVERY: %.2f", summary.DeliveryFee))
	if strings.TrimSpace(summary.DeliveryAreaName) != "" {
		payload = appendLargeLine(payload, "AREA: "+truncateRunes(strings.TrimSpace(summary.DeliveryAreaName), 17))
	}
	payload = appendLargeLine(payload, fmt.Sprintf("TOTAL: %.2f", summary.Total))
	payload = append(payload, bytes.Repeat([]byte{'\n'}, bottomPaddingLines)...)
	payload = append(payload, 0x1d, 0x56, 0x00)
	return payload
}

func appendLargeLine(target []byte, line string) []byte {
	target = append(target, 0x1d, 0x21, 0x11)
	target = append(target, []byte(line)...)
	target = append(target, '\n', 0x1d, 0x21, 0x00)
	return target
}

func wrapRunes(value string, width int) []string {
	runes := []rune(value)
	if len(runes) == 0 {
		return []string{"-"}
	}
	lines := make([]string, 0, (len(runes)+width-1)/width)
	for len(runes) > 0 {
		end := min(len(runes), width)
		lines = append(lines, string(runes[:end]))
		runes = runes[end:]
	}
	return lines
}

func truncateRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit-3]) + "..."
}

func spacedHex(value []byte) string {
	encoded := strings.ToUpper(hex.EncodeToString(value))
	var builder strings.Builder
	builder.Grow(len(encoded) + len(value) - 1)
	for index := 0; index < len(encoded); index += 2 {
		if index > 0 {
			builder.WriteByte(' ')
		}
		builder.WriteString(encoded[index : index+2])
	}
	return builder.String()
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}
