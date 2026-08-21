# A7-tagam receipt print agent

The print agent is the loopback-only bridge between the HTTPS operations admin
and private LAN receipt printers. The backend groups immutable order lines by
their snapshotted printer IP; the agent only validates that plan, prints the
online order number on every chunk, formats large non-fiscal item slips with
separators, prints the backend-owned subtotal, discount, delivery price,
district and final total, preserves safe top/bottom cut margins, and sends the
result through the tested J-Speed WebConfig HTTP interface.

The executable is the same Go source for Windows and macOS. It binds only to
`127.0.0.1:17873`, accepts the production admin origin plus local Vite origins,
and refuses public printer IP addresses. It does not contain an A7-tagam token
or call the production API itself.

## Run locally

```bash
go run ./apps/print-agent
curl http://127.0.0.1:17873/health
```

Keep normal internet access on Wi-Fi. Give the wired LAN adapter a persistent
address in the printer subnet, for example `192.168.123.10/24` when printers
use `192.168.123.x`; do not configure a gateway on that adapter.

## Build Windows and macOS executables

```bash
VERSION=0.1.0 ./apps/print-agent/build-release.sh
```

The ignored `apps/print-agent/dist/` directory then contains Intel and ARM
macOS binaries plus x64 and ARM64 Windows executables. GitHub Actions builds
the same four artifacts after formatting, vet and unit tests pass.

Run the matching artifact while the operations admin is open so a newly
observed kitchen order can print automatically. On macOS, make
the downloaded artifact executable once before starting it:

```bash
chmod +x a7-tagam-print-agent-darwin-arm64
./a7-tagam-print-agent-darwin-arm64
```

On 64-bit Windows, start `a7-tagam-print-agent-windows-amd64.exe`. Keep its
window open while orders are being accepted; closing it disables printing but
does not affect the website or order acceptance.
