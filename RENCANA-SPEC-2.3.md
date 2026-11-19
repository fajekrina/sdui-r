# Rencana spec 2.3 — state halaman dan animasi (tahap 1)

Status: **tahap 1 selesai** (fase 0–6) · branch `feat/single-admin` · 2026-11-19 · K1–K5 disetujui

Interaksi seperti tombol suka / tidak suka di `insightV1` dibuat tanpa script JS dan tanpa
duplikat halaman. Caranya: **state halaman yang deklaratif**. Maker memilih perilaku dari
dropdown di Studio, lalu engine yang menjalankan animasinya.

---

## 1. Cakupan

**Masuk tahap 1**

| # | Kasus | Contoh |
|---|---|---|
| 1 | Pilihan, lalu yang lain menghilang | suka / tidak suka di `insightV1` |
| 2 | Status request | "Terima kasih!" muncul setelah feedback terkirim, pesan gagal + coba lagi |
| 3 | Bisa ditutup (dismissed) | banner promo dengan tombol ✕ |
| 4 | Tampil / sembunyikan saldo | ikon mata |

**Tidak masuk tahap 1:** accordion/tab, validitas form, kondisi dari data di Studio, step,
timer, dan persistensi otomatis. Persistensi baru disiapkan wadahnya (§3.1).

## 2. Prinsip

1. **Tanpa action type baru.** `ActionType` adalah vocabulary tertutup
   (`src/core/actions/spec.ts:65`). Client 2.2 yang menerima `"type": "setState"` akan gagal
   decode dan **seluruh halaman** tidak tampil. Karena itu, perubahan state dilakukan lewat
   **properti tombol** dan status request diisi **otomatis oleh engine**. Properti yang tidak
   dikenal diabaikan oleh client lama, jadi tidak ada yang rusak.
2. **Satu namespace state: `$selected`.** Namespace ini sudah ada sejak 2.2 (`screen.ts:309`),
   sudah ada di data, dan sudah bisa dikirim lewat `params`. Di Studio namanya ditampilkan
   sebagai "State".
3. **Semua properti baru adalah desain (template), bukan konten.** `CONTENT_PROPS` tidak
   berubah dan value set tidak bisa mengubah state.
4. **Satu kondisi per properti**, dengan operator terbatas dan tanpa ekspresi bebas. Satu
   komponen boleh punya beberapa properti berbasis state.
5. **Animasi bernama.** Durasi ditentukan engine, dan `prefers-reduced-motion` berarti tanpa
   animasi (hasil akhirnya tetap sama).
6. **Render pertama tanpa animasi.** Animasi hanya terjadi saat state berubah.

## 3. Model

### 3.1 Deklarasi state (wadah persistensi)

Key opsional baru di template: `state`.

```json
"template": {
  "key": "insightV1",
  "state": {
    "feedback":   { "initial": "{{insight.feedback}}" },
    "saldoTampil": {}
  },
  "root": { … }
}
```

- `initial` berupa string dan boleh `{{token}}`. Defaultnya `""`.
- Nilai state = nilai yang terakhir di-set, atau `initial` yang di-resolve **ulang** terhadap
  data selama state belum pernah di-set. Jadi kalau `load` baru selesai belakangan, nilai
  awalnya ikut terisi.
- **Saat ini:** state hilang ketika halaman ditutup, dan backend belum mengisi
  `insight.feedback`. **Nanti:** backend menyimpan pilihan yang dikirim lewat
  `"params": { "vote": "{{$selected.feedback}}" }` (sudah bisa sejak 2.2), lalu
  mengembalikannya di data. Template tidak perlu diubah.
- Deklarasi dipakai untuk: daftar dropdown di Studio, validasi referensi, dan nilai awal.
  Grup pilihan 2.2 yang tidak dideklarasikan tetap berfungsi seperti sekarang.

### 3.2 Pengubah state (properti tombol)

| Properti | Ada sejak | Efek saat tombol ditekan |
|---|---|---|
| `group` + `value` | 2.2 | `$selected.<group>` = `value` |
| `toggle: "<state>"` | **2.3** | `$selected.<state>` bergantian antara `"on"` dan `""` |

Tombol ✕ di banner cukup memakai `group: "promoBanner", value: "dismissed"`, tanpa properti
baru. Action tombol (kalau ada) tetap berjalan **setelah** state berubah, sama seperti 2.2.

### 3.3 Status request otomatis

Setiap action `api` yang berjalan mengisi `$request.<request>`:
`"pending"` → `"success"` atau `"error"`. Pola ini sama dengan `$load.<request>` yang sudah
ada, dan tidak butuh properti apa pun di template.

### 3.4 Kondisi

```json
{ "state": "feedback", "in": ["", "like"] }
```

- `state` adalah nama state (`$selected.<nama>`). Untuk status request dipakai
  `{ "request": "sendFeedback", "equals": "success" }`. Di spec, `path` (path data apa pun)
  dicadangkan untuk tahap 2 dan belum diterima di 2.3.
- Tepat **satu** operator: `equals`, `notEquals`, `in` (≤ 16 nilai), `empty`: true,
  `notEmpty`: true. `lessThan` ditunda ke tahap 2 karena baru berguna untuk kondisi data.
- Perbandingan berupa string (nilai state selalu string).
- Logika **DAN** dibuat dengan container bertingkat. Logika yang rumit dihitung backend
  menjadi satu field data (tahap 2).

### 3.5 Properti berbasis state

| Properti | Berlaku di | Efek |
|---|---|---|
| `visibleWhen` | semua komponen | tampil hanya jika kondisinya benar. Saat tersembunyi, komponen tidak memakan tempat dan tidak ada di pohon aksesibilitas |
| `disabledWhen` | `button`, `textField`, `textArea`, `picker` | nonaktif jika kondisinya benar |
| `maskedWhen` | `text` | teks diganti `••••••` jika kondisinya benar (lihat keputusan K3) |

`selectedWhen` tidak dibuat, karena `group`/`value` sudah menangani tampilan terpilih.

### 3.6 Transisi

```json
"transition": { "visible": "fade" }
```

- Tahap 1 hanya punya kunci `visible`: `none` (default) · `fade` (200 ms) · `collapse`
  (250 ms). Bentuk objek dipilih supaya `selected`, `expanded` dan lainnya bisa menyusul
  tanpa mengubah format.
- `collapse` mengikuti sumbu induknya: di `hstack` lebarnya yang menyusut, di `vstack`
  tingginya.

### 3.7 Contoh lengkap — `insightV1`

```json
{ "type": "button", "id": "dislike",
  "props": { …, "group": "feedback", "value": "dislike",
    "visibleWhen": { "state": "feedback", "in": ["", "dislike"] },
    "disabledWhen": { "request": "sendFeedback", "equals": "pending" },
    "transition": { "visible": "fade" } },
  "action": { "type": "api", "request": "sendFeedback",
              "params": { "vote": "{{$selected.feedback}}" } } },
{ "type": "button", "id": "like", … sama, dengan "dislike" diganti "like" … },
{ "type": "text", "id": "thanks",
  "props": { "value": "Terima kasih atas masukannya!",
    "visibleWhen": { "request": "sendFeedback", "equals": "success" },
    "transition": { "visible": "fade" } } }
```

Saldo: `text` saldo memakai `"maskedWhen": { "state": "saldoTampil", "empty": true }`, dan
tombol mata memakai `"toggle": "saldoTampil"`.

## 4. Client lama (2.2) yang menerima template 2.3

| Fitur | Perilaku di client 2.2 | Dapat diterima? |
|---|---|---|
| `template.state` | diabaikan | ✅ |
| `visibleWhen` | komponen selalu tampil, jadi kedua tombol tetap ada dan hanya warnanya yang berubah | ✅ menurun dengan wajar |
| `disabledWhen` | tetap aktif. Klik ganda sudah dicegah oleh double-tap guard | ✅ |
| `toggle` | tombol tidak melakukan apa-apa | ⚠️ cukup |
| `transition` | diabaikan | ✅ |
| `$request.*` | kondisi tidak pernah dievaluasi | ✅ |
| `maskedWhen` | **saldo tampil** | ❌ lihat K3 |

## 5. Validasi

- `spec/sdui.schema.json`: `template.state`, schema `condition` (`oneOf` satu operator),
  `visibleWhen` / `disabledWhen` / `maskedWhen` / `transition` / `toggle` di props yang
  relevan. Fixture lama yang 2.2 tetap valid.
- `spec/bounds.json`: `maxStates` 16, `maxConditionValues` 16.
- Client validator (`src/core/validator.ts`):
  - nama state harus identifier dan terdeklarasi, **atau** dipakai sebagai `group`/`toggle`
    di template;
  - `request` dalam kondisi harus nama request yang dipakai oleh salah satu action `api`;
  - operator ganda atau kosong ditolak.
- Service `SpecContract`: `SCHEMA_VERSION = "2.3"`, `ACCEPTED_VERSIONS` + `"2.3"`. Schema
  ikut tersalin otomatis lewat `sdui-foundation/build.gradle.kts`.
- `src/spec/index.ts`: `SPEC_VERSION = '2.3'`, dengan komentar daftar tambahan 2.3.

## 6. Render (web: vanilla, React, Vue)

- Evaluator kondisi ditaruh di `src/core/condition.ts`, sebagai fungsi murni (±40 baris).
- `RenderContext`: `visible(node)`, `disabled(node)`, `masked(node)`.
  `$request` di-set di `screen.ts` sekitar `dispatch` untuk action `api`.
- **Exit animation:** node yang tersembunyi tetap ada di RenderNode tree dengan penanda
  `hidden: 'fade' | 'collapse' | true`. Adapter memasang class `sdui-out`, lalu setelah
  `transitionend` (atau timeout cadangan) memasang `hidden` / `aria-hidden`. Node tanpa
  `transition` langsung dibuang dari tree, sama seperti sekarang.
- Gaya transisi ditulis sebagai class di stylesheet engine, bukan inline, supaya CSP ketat
  tetap aman (`conformance/csp.*`). Di dalam `@media (prefers-reduced-motion: reduce)`
  semua durasinya 0.
- **Fokus:** jika elemen yang sedang fokus disembunyikan, fokus pindah ke tombol yang
  terpilih di grup yang sama, atau ke induknya.
- Budget ukuran core 24 KB (`npm run size`): perkiraan tambahan +1–1.5 KB.

## 7. Studio

- **Panel halaman → "State"**: daftar state (nama + nilai awal). Grup dan toggle yang
  dipakai tombol muncul otomatis.
- **Panel komponen → bagian "Interaksi"**:
  - "Tampil jika": state (dropdown) → operator (dropdown) → nilai (dropdown nilai yang
    mungkin, diambil dari `value` tombol di grup itu, dan tetap bisa diketik).
  - "Animasi muncul/hilang": tidak ada · fade · collapse.
  - Tombol: "Saat diklik": tidak mengubah state · pilih nilai di grup (`group`/`value`) ·
    toggle state.
  - Button/field: "Nonaktif jika …". Text: "Sembunyikan (mask) jika …".
- **Mode coba di canvas**: klik di preview benar-benar mengubah state dan animasinya
  berjalan. Ada juga panel kecil untuk mengatur nilai setiap state secara manual, termasuk
  mensimulasikan `$request` pending/success/error.
- **Outline**: komponen bersyarat diberi ikon mata-coret. Komponen yang sedang tersembunyi
  tetap bisa dipilih di outline.
- **Peringatan**: state dibaca tetapi tidak pernah diubah · nilai di kondisi tidak pernah
  di-set tombol mana pun · komponen tidak akan pernah tampil · `maskedWhen` tanpa tombol
  `toggle` (saldo tidak bisa dibuka).
- Deskripsi dan bantuan di `describe.ts`. Diff terhadap baseline sudah generik untuk props,
  jadi cukup diperiksa.

## 8. Tes dan fixture

- `tests/spec23.test.ts`: decode, validator (valid/invalid), evaluator kondisi, `toggle`,
  `$request` (pending→success, pending→error), `initial` yang di-resolve ulang setelah
  `load`, render tanpa animasi di render pertama, reduced motion, perpindahan fokus.
- `tests/parity.test.tsx`: vanilla / React / Vue menghasilkan DOM dan class yang sama.
- Fixture valid: `template_insight.json` dinaikkan ke 2.3 (contoh §3.7), ditambah
  `template_wallet.json` (saldo + toggle) dan `template_banner.json` (dismissed).
- Fixture invalid: `condition_two_operators.json`, `condition_unknown_state.json`,
  `transition_unknown.json`, `state_bad_name.json`.
- `conformance/`: animasi fade/collapse di browser nyata, dan CSP ketat tetap lolos.
- Service: `FoundationTest` / `TemplateServiceIT` menerima 2.3 dan menolak fixture invalid.
- Studio: `builder-features.test.ts` untuk panel Interaksi, mode coba, dan peringatan.

## 9. Dokumentasi

`spec/README.md` (bagian "State and transitions (v2.3)") · `CHANGELOG.md` · `README.md` ·
`C:\sdui-r\MANUAL-EDITOR-SDUI-R.md` (cara membuat interaksi suka/tidak suka) ·
`DESAIN-ARSITEKTUR-SDUI.md` (alasan tanpa action type baru).

## 10. Urutan kerja

Setiap fase diakhiri dengan tes hijau, lalu berhenti untuk konfirmasi.

| Fase | Isi | File utama |
|---|---|---|
| 0 | Commit pekerjaan 2.2 yang masih terbuka di working tree sebagai dasar | — |
| 1 | Spec: schema, bounds, `SPEC_VERSION`, validator, fixture, `spec/README` | `spec/*`, `src/spec/index.ts`, `src/core/validator.ts`, `src/core/template.ts` |
| 2 | Engine: evaluator kondisi, `toggle`, `$request`, `initial` | `src/core/condition.ts`, `render-context.ts`, `screen.ts`, `components/builtins.ts` |
| 3 | Render + animasi: tiga adapter, CSS, fokus, reduced motion, CSP | `render-node.ts`, `src/react`, `src/vue`, `src/vanilla`, stylesheet |
| 4 | Studio: panel State, Interaksi, mode coba, peringatan | `src/builder/studio.ts`, `describe.ts`, `controls.ts`, `preview.ts` |
| 5 | Service: `SpecContract` 2.3 + tes | `service/sdui-foundation`, `template-service` |
| 6 | Dokumentasi, CHANGELOG, `npm run size`, conformance, aplikasi react/vue dibangun ulang | — |

## 11. Keputusan yang perlu dikonfirmasi

| | Pertanyaan | Usulan |
|---|---|---|
| K1 | Namespace state: tetap memakai `$selected` atau memakai `$state` baru? | **Tetap `$selected`**. Sudah ada, sudah terdokumentasi, sudah bisa dikirim lewat params. Namespace baru berarti ada dua tempat untuk hal yang sama |
| K2 | Mengubah state hanya lewat properti tombol, tanpa action `setState`? | **Ya**. Action type baru membuat client 2.2 gagal menampilkan seluruh halaman. `setState` bisa dipertimbangkan nanti setelah decode action dibuat toleran (lihat K5) |
| K3 | `maskedWhen` tidak berlaku di client lama, jadi saldo tampil | **Masukkan**, dengan catatan bahwa mask di client hanya melindungi dari orang yang melihat layar, bukan pengamanan data. App dan package dirilis bersama, sehingga risikonya hanya client PWA lama yang masih ter-cache. Alternatifnya: tunda `maskedWhen` ke tahap 2 |
| K4 | Saat tersembunyi, komponen tidak memakan tempat (`display: none`), bukan sekadar transparan? | **Tidak memakan tempat**. Itu yang dibutuhkan kasus suka/tidak suka: tombol yang tersisa bergeser ke tengah |
| K5 | Sekalian membuat decode action toleran (action type yang tidak dikenal menjadi no-op + peringatan, bukan error)? | **Ya, di 2.3**. Tidak dipakai sekarang, tetapi membuka jalan untuk action baru di 2.4 tanpa merusak client 2.3 |

## 12. Risiko

- **Animasi keluar di tiga adapter.** React/Vue biasanya langsung membuang node, jadi node
  harus dipertahankan sampai `transitionend`. Ini dicakup oleh tes parity dan conformance.
- **Kosakata membengkak.** Aturannya: perilaku baru hanya ditambahkan jika dipakai di ≥ 2
  template nyata.
- **Maker bingung dengan kondisi.** Karena itu ada mode coba, simulasi state, dan peringatan
  di Studio.
