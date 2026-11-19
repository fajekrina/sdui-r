# Rencana spec 2.5 — pilih & tip untuk semua jenis chart

Status: **selesai** (fase 0–5) · branch `feat/single-admin` · 2026-11-19 · K1–K6 disetujui · core 29,5 / 32 KB · lanjutan
[RENCANA-SPEC-2.4](./RENCANA-SPEC-2.4.md)

Spec 2.4 membuat **bar** bisa dipilih dan punya tip yang mengikuti batang. Di 2.5, **line, area, pie, dan donut**
mendapat perilaku yang sama, dengan **properti yang sama**: `selectState`, `initialSelection`, `selectedColor`,
`tip`. Mengganti `kind` di Studio tidak perlu mengatur ulang apa pun.

Bentuk properti tidak berubah; yang bertambah hanya jenis chart yang membacanya. Client 2.4 tetap menampilkan
line/area/pie/donut statis, dan bar tetap seperti 2.4.

Sudah dikerjakan sebelum rencana ini: inspector Studio mengikuti `kind` (package `c30eb50`). Di 2.5 tabel
`CHART_KINDS` cukup diperluas, sehingga properti pilih tampil untuk semua jenis.

---

## 1. Model per jenis

| | bar (2.4) | line / area | pie / donut |
|---|---|---|---|
| Yang dipilih | batang | titik | irisan |
| Target sentuh | tombol transparan per slot | **sama**: tombol per slot (kolom penuh, jadi titik terdekat menurut sumbu x) | irisan itu sendiri (path SVG bisa diklik) + item legenda sebagai tombol |
| Tanda terpilih | `selectedColor` pada batang | **titik penanda** bulat di posisi titik (lihat K1) | irisan **menonjol keluar** sedikit + `selectedColor` bila diisi (K2) |
| Tip | di atas batang | di atas titik | di luar irisan, searah sudut tengahnya (K3) |
| Posisi | % dari data | % dari data (`x` = pusat slot, `y` = nilai titik) | % dari sudut tengah irisan pada lingkaran (`50 + r·sin a`, `50 − r·cos a`) |
| Hover web | pratinjau | pratinjau | pratinjau (irisan dan legenda) |

Semua posisi **dihitung** core dari data dalam persen, tidak diukur dari DOM, jadi semua engine sepakat (prinsip yang
sama dengan 2.4).

### 1.1 line / area — penanda titik

- SVG garis memakai `preserveAspectRatio="none"`, sehingga lingkaran di dalam SVG akan gepeng. Karena itu penanda
  dibuat sebagai **elemen HTML bulat** (`border-radius: 50%`) di lapisan yang sama dengan tip, diposisikan dengan
  `left` / `bottom` dalam persen.
- Warnanya `selectedColor`, atau warna garis bila kosong. Ukuran 10 px dengan cincin putih 2 px.
- Tanpa pilihan (`initialSelection: none` dan belum diketuk): tidak ada penanda.

### 1.2 pie / donut — irisan menonjol

- Irisan terpilih digeser 4 % keluar searah sudut tengahnya, lewat atribut `transform` pada `path` (tidak memakai
  CSS, jadi CSP ketat aman). Warnanya `selectedColor` bila diisi, kalau tidak warna irisannya sendiri.
- Tip ditempatkan di titik pada radius 52 % searah sudut tengah. Arah geser tip menyesuaikan kuadran: di sisi kanan
  tip ke kanan, di kiri ke kiri, di atas ke atas, di bawah ke bawah. Dengan begitu tip tidak menutupi irisannya.
- Kotak chart diberi ruang tambahan di sekeliling lingkaran (K3) supaya tip tidak terpotong.
- Item legenda menjadi tombol (fokus, Enter/Spasi, `aria-pressed`). Kalau `showLegend: false`, tombol-tombol itu
  tetap ada tetapi **tersembunyi secara visual** (hanya untuk keyboard dan pembaca layar, K4).

## 2. Animasi

- Tip **bergeser** ke pilihan baru di semua jenis (`Motion.from` dari 2.4).
- Penanda titik line/area ikut bergeser bersama tip.
- Irisan pie yang menonjol berpindah tanpa animasi; sama dengan warna batang di 2.4, karena vanilla membangun
  ulang DOM.
- Tidak ada animasi saat render pertama, di preview statis, atau dengan `prefers-reduced-motion`.

## 3. Client lama

| Client | Perilaku dengan template 2.5 |
|---|---|
| 2.4 | bar seperti 2.4; line/area/pie/donut statis (properti pilih diabaikan) |
| 2.3 dan lebih lama | semua chart statis |

## 4. Perubahan per bagian

| Bagian | Isi |
|---|---|
| Spec | `SPEC_VERSION` 2.5; deskripsi schema dan `spec/README.md` (properti pilih berlaku untuk semua jenis); fixture `chart_tip_line.json`, `chart_tip_pie.json`; service menerima 2.5 (build ulang + restart) |
| Core | `chart.ts`: `plot()` umum untuk bar/line/area (tombol slot + tip + penanda); `round()` untuk pie/donut (irisan bisa diklik, menonjol, tip menurut sudut, legenda tombol) |
| Adapter | tidak ada event baru (klik dan hover di elemen apa pun sudah generik), hanya parity test |
| Studio | `CHART_KINDS`: properti pilih untuk semua jenis; peringatan "only work on a bar chart" dihapus; Preview langsung mencobanya |
| Tes | unit per jenis (posisi tip, penanda, irisan, legenda, a11y, hover, `initialSelection`), parity, conformance Chromium ≡ WebKit untuk line dan pie, CSP ketat |
| Dokumen | `spec/README.md`, `CHANGELOG.md`, `README.md`, manual editor |

## 5. Urutan kerja

| Fase | Isi |
|---|---|
| 0 | Konfirmasi K1–K6 (budget, K5) |
| 1 | Spec 2.5 + service menerima 2.5 |
| 2 | Engine line/area (penanda, tip) |
| 3 | Engine pie/donut (irisan, tip menurut sudut, legenda) |
| 4 | Studio (`CHART_KINDS`, peringatan) + tes + conformance |
| 5 | Dokumen, CHANGELOG, size, semua tes |

## 6. Keputusan yang perlu dikonfirmasi

| | Pertanyaan | Usulan |
|---|---|---|
| K1 | Tanda titik terpilih di line/area | **Titik bulat 10 px** dengan cincin putih, warna `selectedColor` (atau warna garis) |
| K2 | Tanda irisan terpilih di pie/donut | **Menonjol 4 % keluar** + `selectedColor` bila diisi (tanpa `selectedColor`: warna irisan tetap) |
| K3 | Posisi tip pie/donut | **Di luar irisan**, searah sudut tengahnya, dengan ruang tambahan di sekeliling lingkaran (sekitar tinggi tip). Alternatif: tip selalu di tengah donut, tetapi itu tidak berlaku untuk pie |
| K4 | Aksesibilitas pie tanpa legenda | **Tombol tersembunyi secara visual** tetap ada untuk keyboard dan pembaca layar |
| K5 | Budget core | Core sekarang **28,9 / 30 KB** dan perkiraan +1–1,3 KB, jadi hampir pasti melewati 30 KB. Usul: **naikkan ke 32 KB** |
| K6 | Line: target sentuh | **Satu kolom penuh per titik** (memilih titik terdekat menurut sumbu x), sama dengan slot bar |

## 7. Risiko

- **Tip pie di chart kecil.** Ruang tambahan membuat kotak chart lebih besar dari diameternya. Diuji di conformance
  dengan `height` 120 dan 240.
- **Irisan sangat kecil** (misalnya 2 %) sulit diketuk. Legenda tetap menjadi target alternatif, dan Studio memberi
  peringatan bila ada irisan < 5 %.
- **Ukuran core** (K5).
