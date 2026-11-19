# Rencana spec 2.4 — chart interaktif (tahap 1: bar)

Status: **tahap 1 selesai** (fase 0–6) · branch `feat/single-admin` · 2026-11-19 · K1–K6 disetujui · core 28,9 / 30 KB

Tujuan: di `insightV2`, mengetuk (atau di web: mengarahkan kursor ke) sebuah batang memunculkan tip **di atas
batang itu**, berisi data batang itu (bulan + nominal), dengan animasi geser. Saat ini tip adalah komponen
terpisah (`chartTip`) yang selalu menampilkan `peak`.

Semuanya **tambahan** (minor 2.4): tidak ada properti atau perilaku 2.3 yang berubah. Client 2.3 menampilkan
grafik statis seperti sekarang.

---

## 1. Kondisi sekarang (yang membuat spec perlu ditambah)

- Batang hanyalah `path` SVG tanpa handler. `RenderNode.on` hanya punya `click` dan `submit`, belum ada hover.
- Slot `action` chart sudah dipakai sebagai **sumber data** (`api coffeeSpending`), jadi perilaku "ketuk batang"
  tidak bisa memakai action; harus berupa properti.
- Token `{{…}}` tidak bisa memilih "item yang sedang dipilih" dari sebuah daftar.
- Chart menggambar di `viewBox` 0–100 (`VIEW = 100`), jadi posisi batang ke-*i* sudah diketahui dalam persen.

## 2. Cakupan tahap 1

**Masuk:** chart `kind: bar` — pilih batang (tap; hover di web), tip bawaan yang mengikuti batang, warna batang
terpilih, state yang bisa dibaca komponen lain, animasi geser, aksesibilitas, Studio, data source, migrasi
`insightV2`.

**Belum:** `line` / `area` (titik terdekat), `pie` / `donut` (per irisan), tip dengan gambar, dan beberapa batang
terpilih sekaligus.

## 3. Model

### 3.1 Properti baru `chart`

```json
{ "type": "chart", "id": "spendChart",
  "props": {
    "kind": "bar",
    "selectState": "spendBar",
    "initialSelection": "last",
    "selectedColor": "#D95C5C",
    "tip": "{{item.label}}\n**{{item.amount}}**"
  },
  "action": { "type": "api", "request": "coffeeSpending" } }
```

| Properti | Nilai | Efek |
|---|---|---|
| `selectState` | identifier | Membuat batang bisa dipilih. Pilihan ditulis ke state `$selected.<selectState>` = **key** item (tanpa `key`: indeksnya, `"0"`, `"1"`, …). Komponen lain membacanya lewat `visibleWhen` / token. Tanpa properti ini chart tetap statis. |
| `initialSelection` | `last` · `first` · `none` (default) · key item | Pilihan awal selama state belum di-set tap. Seperti `initial` state 2.3: dihitung ulang terhadap data, jadi tetap benar saat data source datang belakangan. |
| `selectedColor` | warna (token / hex) | Warna batang terpilih. Batang lain memakai `color` item atau `color` chart, seperti sekarang. |
| `tip` | teks (≤ `maxStringLength`) | Tip di atas batang terpilih. Token `{{item.<field>}}` dibaca dari item terpilih; token lain dari data layar. `**tebal**` / `*miring*` berlaku (markup 2.1), dan `\n` menjadi baris baru. Tanpa `tip`: tidak ada tip, tetapi pilihan dan warna tetap jalan. |

Semuanya **desain** (template), bukan konten. Data source cukup mengirim field yang dipakai `tip`; untuk
`coffeeSpending` ditambah `amount` per item ("Rp1.140.000").

### 3.2 Posisi tip — dihitung, bukan diukur

- Horizontal: pusat batang ke-*i* = `(i + 0.5) / n × 100%`. Untuk batang pertama dan terakhir, tip menempel ke
  tepi (`left: 0` / `right: 0`) supaya tidak terpotong.
- Vertikal: tepat di atas puncak batang = `bottom: (tinggi batang / tinggi plot) × 100%` plus jarak 6 px.
- Tip diletakkan di lapisan absolut di atas SVG, di dalam kotak chart. Ruang di atas batang tertinggi disediakan
  otomatis (`paddingTop` setinggi tip) supaya tip tidak menimpa konten di atasnya.
- Karena semuanya persen dari data, tidak ada pengukuran DOM: hasilnya sama di Chromium, WebKit, dan native.

### 3.3 Interaksi

- **Tap** (semua platform): baris tombol transparan di atas plot, satu per batang, selebar slotnya (minimal
  44 px; kalau slot lebih sempit, area sentuh tetap selebar slot). Tap = set state `selectState` ke key item,
  memakai jalur `Selection` 2.2/2.3 yang sudah ada.
- **Hover** (web, mouse saja): event baru `RenderNode.on.hover`; adapter mengikat `pointerenter` dengan
  `pointerType === 'mouse'` ke handler yang sama. Lihat keputusan **K2**.
- **Keyboard:** tombol-tombol itu bisa difokus dengan Tab; Enter/Spasi memilih.

### 3.4 Animasi

- Tip **bergeser** dari batang lama ke batang baru (`translate` lewat WAAPI, 200 ms). Core tahu posisi lama dan
  baru dalam persen, jadi animasinya data (`Motion` jenis baru `move`), sama seperti `fade` / `collapse` di 2.3.
- Warna batang lama dan baru berganti dengan transisi `fill` 150 ms.
- Tidak ada animasi pada render pertama, di preview statis, atau dengan `prefers-reduced-motion`.

### 3.5 Aksesibilitas

- Setiap tombol batang: `aria-label` = "Apr 2025, Rp1.140.000" (label item + `amount` atau nilai) dan
  `aria-pressed` untuk yang terpilih.
- Tip `aria-live="polite"`, supaya pembaca layar mengumumkan isi tip yang baru.

### 3.6 Contoh — insightV2 setelah migrasi

```json
{ "type": "chart", "id": "spendChart",
  "props": { "kind": "bar", "height": 120, "min": 0, "showLegend": false,
    "selectState": "spendBar", "initialSelection": "last", "selectedColor": "#D95C5C",
    "tip": "{{item.label}}\n**{{item.amount}}**" },
  "action": { "type": "api", "request": "coffeeSpending" } }
```

Komponen `chartPeak` / `chartTip` dihapus. Warna batang dari data (`#FDE8E8`) tetap, dan batang terpilih menjadi
`#D95C5C`.

## 4. Client lama (2.3) yang menerima template 2.4

| Fitur | Perilaku di client 2.3 |
|---|---|
| `selectState`, `initialSelection`, `selectedColor` | diabaikan: grafik statis dengan warna dari data |
| `tip` | diabaikan: **tidak ada tip** (lihat **K5**) |
| `on.hover` | tidak pernah dibuat (event itu dibuat oleh engine 2.4) |
| field `amount` di item | diabaikan |

## 5. Perubahan per bagian

| Bagian | Isi |
|---|---|
| Spec | `SPEC_VERSION` 2.4; schema `nodeProps` + `selectState` (identifier), `initialSelection` (string), `selectedColor` (string warna), `tip` (string); `spec/README.md` bagian "Interactive chart (v2.4)"; fixture valid + invalid; service `ACCEPTED_VERSIONS` + "2.4", sinkron schema, build ulang, restart |
| Core | `chart.ts`: tombol per batang (`on.click` + `on.hover` → `Selection`), warna terpilih, lapisan tip (posisi persen, markup + token `item`), `initialSelection` (dihitung ulang seperti `initial`); `motion.ts`: jenis `move`; `RenderNode.on.hover` |
| Adapter | vanilla / React / Vue: ikat `pointerenter` (mouse) untuk `on.hover`, generik tanpa cabang per tipe; `playMotion` untuk `move` |
| Studio | grup **Chart** di inspector chart: `selectState` (otomatis `<id>Bar` saat `tip` diisi), `initialSelection` (dropdown + key dari contoh data), `selectedColor`, `tip` (kotak multi-baris + daftar field item yang tersedia dari contoh data); `stateWarnings`: `tip` tanpa `selectState`, field `item.x` yang tidak ada di contoh data |
| Data source | `coffeeSpending`: `amount` per item; `SAMPLE_DATA` app ikut |
| Template | migrasi `insightV2` ke tip bawaan (draf dulu, terbit setelah dikonfirmasi) |
| Tes | unit: posisi tip (tengah, tepi), token `item`, markup, `initialSelection` + data datang belakangan, tap/hover → state, warna, a11y, client lenient; parity tiga adapter; conformance: tip di Chromium ≡ WebKit, CSP ketat; Studio |
| Dokumen | `spec/README.md`, `CHANGELOG.md`, `README.md`, `DESAIN-ARSITEKTUR-SDUI.md`, manual editor (resep "tip mengikuti batang") |

## 6. Urutan kerja

| Fase | Isi |
|---|---|
| 0 | Budget core 30 KB (sudah) + commit rencana ini |
| 1 | Spec 2.4: schema, fixture, `SPEC_VERSION`, README, service menerima 2.4 (restart) |
| 2 | Engine: pilihan, warna, tip (posisi, token, markup), `initialSelection`, a11y |
| 3 | Adapter + animasi: `on.hover`, `move`, reduced motion, parity, conformance, CSP |
| 4 | Studio: grup Chart, peringatan, Preview |
| 5 | Data source `amount` + migrasi draf `insightV2` (terbit setelah dikonfirmasi) |
| 6 | Dokumen, CHANGELOG, size, semua tes |

## 7. Keputusan yang perlu dikonfirmasi

| | Pertanyaan | Usulan |
|---|---|---|
| K1 | Tahap 1 hanya `bar`? | **Ya.** `line` / `area` / `pie` / `donut` menyusul dengan model yang sama |
| K2 | Hover di web: memindahkan **pilihan** (menulis state) atau hanya **pratinjau** tip (kembali ke pilihan saat kursor keluar)? | **Pratinjau saja.** State hanya berubah saat tap/klik, jadi komponen lain tidak ikut berkedip saat kursor lewat. Butuh dua event (`hover` + `hoverEnd`) |
| K3 | Token di `tip`: `{{item.label}}` atau `{{label}}`? | **`{{item.label}}`.** Tidak bentrok dengan data layar, dan sejalan dengan baris `list` |
| K4 | Nilai state: `key` item (atau indeks bila tidak ada `key`)? | **Ya.** Key lebih stabil daripada indeks saat data berubah |
| K5 | Client 2.3 kehilangan tip setelah `insightV2` dimigrasi | **Terima.** App dan package dirilis bersama; alternatifnya mempertahankan `chartTip` lama dengan `visibleWhen` yang tidak pernah benar di 2.4 — rumit, tidak diusulkan |
| K6 | Mengetuk batang yang sudah terpilih | **Tetap terpilih** (tidak membatalkan pilihan) |

## 8. Risiko

- **Tip menimpa konten di atas grafik.** Ruang di atas batang tertinggi disediakan otomatis (§3.2); diuji di
  conformance.
- **Batang sangat sempit** (banyak item) membuat area sentuh kecil. Area sentuh selebar slot, dan Studio memberi
  peringatan kalau slot < 44 px pada lebar 375.
- **Ukuran core.** Perkiraan +1–1,5 KB, jadi masih di bawah 30 KB.
- **Teks tip panjang** bisa melebar keluar kotak chart. Lebar tip dibatasi `max-width: 60%` dan teks dibungkus.
