# Rencana — kembali ke tab Template & Konten (editor Studio di keduanya)

Status: **selesai (F1–F5, 2026-11-20)** · branch `feat/single-admin` (package, service, app) · keputusan tambahan di §6.
Lanjutan rencana single-admin (2026-11-18) dan single publish (app `d8b360c`); menggantikan alur "satu editor + satu
Terbitkan".

## 0. Latar

- **sdui-r dipakai pengguna internal**, jadi **tidak ada checker/reviewer** untuk template maupun konten: Terbitkan
  langsung aktif/tayang (K9). sdui "biasa" untuk pengguna eksternal tetap butuh checker dan tidak disentuh rencana ini.
- Studio kembali punya **dua tab**: **Template** dan **Konten**. Bedanya dengan versi lama (app `698f6f8`):
  - kedua tab memakai **editor Studio yang sekarang** (inspector bergrup, State, Interaction, chart 2.5, dst.), bukan
    Template Builder + ScreenBuilder/ValuesEditor lama, dengan spec terbaru;
  - di tab Konten pengguna **memilih template yang sudah dibuat** (tidak ada palet komponen), lalu boleh mengubah
    **semua prop** komponennya: isi, style, layout, sumber data, tujuan tombol. Yang tidak bisa: menambah, menghapus,
    atau memindah komponen (K2).
- **Tidak ada kata "toko"**: pengguna login dengan namanya sendiri; halaman dikelompokkan per **kanal** (K6).
- Rangka template mengikuti `template V1.jpeg` dan `template V2.jpeg`: empat template awal di database (§4, K3, K8).

## 1. Model

| | Tab **Template** | Tab **Konten** |
|---|---|---|
| Yang dibuat | template: komponen apa saja + nilai default (termasuk isi contoh `[ ]`, K10) | halaman = template terpilih + penimpaan |
| Editor | Studio penuh: palet, outline, drag & drop, hapus, JSON | Studio **struktur terkunci**: tanpa palet, tanpa tambah/hapus/pindah, id read-only |
| Yang bisa diubah | semuanya | semua prop kecuali struktur (`type`, `id`, `children`, `order`), termasuk `action` (K2) |
| Disimpan di | template-service (versi, rilis bertanda tangan) | value-service (value set halaman = **selisih** terhadap template, dipin ke versi template) |
| Terbit | versi baru langsung aktif; tawaran ikut memperbarui halaman (K5) | halaman langsung tayang; peringatan bila masih ada isi contoh `[...]` (K10) |
| Relasi | 1 template → **banyak halaman** (K1) | halaman menunjuk `template_key` + `template_version` |
| Pemilik | **bersama** semua pengguna (K6b) | per **kanal**; semua pengguna boleh mengelola semua kanal (K6a) |

- Data model value-service **sudah** memisahkan `screen_key` dan `template_key` (`VAL.screen`); yang membuat
  "halaman = template" hanyalah app (`page.ts`). Tabel tidak perlu diubah untuk K1.
- Halaman menyimpan hanya prop yang berbeda dari template, jadi perubahan template mengalir ke prop yang tidak ditimpa
  (setelah rebase, K5).
- **Tanpa migrasi data** (K10): halaman lama (opsi B) menyimpan isinya di value set; di model baru isi itu terbaca
  sebagai penimpaan, jadi tampil sama.

## 2. Spec 2.6 — value set boleh menimpa semua prop kecuali struktur

Sekarang value set hanya boleh berisi **content props** (`CONTENT_PROPS` / `spec/content.json`); client dan backend
menolak yang lain. Di 2.6:

- Value set boleh menimpa **semua prop** sebuah komponen, kecuali struktur: `type`, `id`, `children`, `order`.
  Tidak ada daftar prop per komponen.
- Value set boleh menimpa **`action`** komponen (tujuan CTA, tujuan kartu list, sumber data chart). Nama tujuan /
  sumber tetap dari katalog (`screens`, `links`, `sources`, `requests`) dan divalidasi seperti action template.
- Logika interaksi (`group`/`value`/`toggle`, `visibleWhen`/`disabledWhen`/`maskedWhen`, `selectState`, jenis action)
  seharusnya milik template, tetapi **untuk saat ini boleh ditimpa** (K2). Tidak ada gembok prop (K7); keduanya bisa
  ditambah nanti tanpa mengubah format.
- `compose()` di client sudah menimpa `props` apa pun; yang berubah: validasi (client, schema, `SpecContract` di
  service), penimpaan `action`, dan `content.json` diganti aturan "semua kecuali struktur".
- Client 2.5 menolak value set 2.6 yang menimpa prop non-konten (fail closed), maka versi spec dinaikkan.

## 3. Pekerjaan per fase

Setiap fase diuji dan di-commit sendiri; lanjut ke fase berikutnya setelah lampu hijau.

**F1 — package: spec 2.6 dan core**
- `SPEC_VERSION` 2.6; `isOverridableProp(type, prop)` (= bukan struktur); validasi value set termasuk `action`;
  schema; `spec/README.md`; fixture valid/invalid; CHANGELOG.
- `src/builder/content.ts`: `mergePage` (template + penimpaan → pohon editor) dan `splitPage` (pohon editor →
  penimpaan = selisih terhadap template, termasuk `action`). `mergeContent`/`splitContent` (opsi B) dipensiunkan.
- Deteksi isi contoh: teks yang seluruhnya `[...]` (`placeholders(tree)`), untuk peringatan K10.

**F2 — Studio: mode Konten**
- `EditorDocument` mode `page`: palet disembunyikan; drag & drop, hapus, duplikat, tempel dimatikan; editor JSON
  menolak perubahan struktur; id read-only.
- Inspector: semua grup bisa diedit; grup logika (State, Interaction bagian logika) diberi peringatan "milik template".
- Prop yang ditimpa diberi tanda + tombol **Kembalikan ke template** (per prop dan per komponen).
- **Tabel item `list`** (K4): kolom dari token `{{item.*}}` kartu cetakan; tambah/hapus/urutkan item.
- Peringatan saat Terbitkan bila masih ada isi contoh `[...]` (tidak memblokir).
- Banner "Template punya versi baru vN → Perbarui" (K5).
- Tab Template: dialog setelah Terbitkan, "Perbarui juga N halaman?" + daftar halaman dan yang akan hilang (K5).

**F3 — service**
- value-service: validasi `isOverridableProp` + action; endpoint **buat halaman dari template**
  (`screen_key`, `template_key`, judul); **rebase + terbit** satu atau banyak halaman sekaligus (hasil per halaman);
  daftar halaman per template (jumlah pemakai).
- template-service: template **bersama** (`owner` tidak lagi menyaring, tetap dicatat sebagai pembuat); **seeder
  startup** 4 template awal (buat + terbitkan v1 oleh `system`, idempoten); template lama `insightV*` ditandai
  deprecated dengan pengganti.
- studio-bff: tab Template → simpan/terbitkan template; tab Konten → simpan/terbitkan halaman; endpoint gabungan
  `/pages/{key}/publish` dipensiunkan. Pemilih template hanya menampilkan template terbit yang tidak deprecated.
- Identitas (K6): login = nama pengguna (bukan merchant); konsep `merchant` diganti **kanal** di API/UI; struktur
  tabel, manifest per kanal, tanda tangan, dan delivery tetap. Pengguna memilih kanal; semua pengguna boleh semua kanal.

**F4 — app (React dan Vue; `src/api` dan `src/sdui` tetap identik)**
- Rute `/studio/templates/:key` (tab Template) dan `/studio/pages/:kanal/:key` (tab Konten); tautan lama diarahkan.
- Tab Template: daftar template (+ jumlah halaman pemakai). Tab Konten: pemilih kanal, daftar halaman (+ template asal,
  penanda versi baru), **Buat halaman** = pilih template (judul + pratinjau) + kunci halaman.
- Hapus kata "toko" (placeholder login `mis. toko_baru`, label "Halaman · {merchant}"); navbar nasabah menampilkan kanal.
- `page.ts`: template dan halaman dimuat dan disimpan terpisah.

**F5 — template rangka, dokumen, uji**
- JSON 4 template (§4) sebagai fixture `spec/fixtures/valid/` dan sumber seeder.
- `MANUAL-EDITOR-SDUI-R.md`, `DESAIN-SDUI-R.md`, README, CHANGELOG.
- Uji: unit (penimpaan, split/merge, mode terkunci, tabel list), kontrak service, e2e app, conformance
  Chromium ≡ WebKit.

## 4. Rangka template (gambar V1 / V2)

Halaman "Smart Insight Detail", warna dan ukuran diperkirakan dari gambar (bisa diubah di tab Template):

1. Header berlatar teal muda: tombol kembali (`arrow.left`) + **[Page Name]**.
2. **Ilustrasi** (image frame) di header.
3. **Kartu putih yang menumpuk** di atas header (`spacing` negatif): **[Insight Title]**, **[Insight Long Description]**.
   **V2** menambah di dalam kartu: **chart bar** (sumber data dipilih di Konten) dan kotak abu **[Bar Chart Description]**.
4. **Section Title**, lalu kartu list sebagai **`list`** (K4): ikon bulat, [List Title], [Card Description 1],
   **[Card Description 2]**; tanpa CTA: chevron `>` dan kartu bisa diklik (tujuan dari data item); dengan CTA: tanpa
   chevron, tidak bisa diklik.
5. "Suka dengan insight ini?" + **Kurang Suka** (`hand.thumbsdown`) / **Suka!** (`hand.thumbsup`) dalam lingkaran
   (grup pilihan 2.2, `sendFeedback`).
6. Varian CTA: tombol teal penuh tersemat di bawah (`pin: bottom`, `shadow: top`).

| Kunci | Judul | Chart | CTA | Kartu list |
|---|---|---|---|---|
| `smartInsightV1` | Smart Insight V1 | – | – | chevron, bisa diklik |
| `smartInsightV1Cta` | Smart Insight V1 + CTA | – | ✓ | tanpa chevron, tidak bisa diklik |
| `smartInsightV2` | Smart Insight V2 | ✓ | – | chevron, bisa diklik |
| `smartInsightV2Cta` | Smart Insight V2 + CTA | ✓ | ✓ | tanpa chevron, tidak bisa diklik |

`spec/fixtures/valid/template_insight.json` menjadi titik awal V1.

## 5. Keputusan (2026-11-20)

- **K1** Satu template untuk banyak halaman; Buat halaman = pilih template + kunci halaman sendiri.
- **K2** Konten boleh mengubah semua prop kecuali struktur: semua teks (dengan atau tanpa `[ ]`), gambar, style, layout,
  sumber data chart (hanya di template ber-chart), tujuan tombol. Logika interaksi seharusnya milik template, tetapi
  untuk sementara bisa diubah di kedua tab.
- **K3** Empat template terpisah (V1, V1 + CTA, V2, V2 + CTA); ada CTA = kartu list tanpa chevron dan tidak bisa
  diklik. Konten tidak menyembunyikan komponen.
- **K4** Kartu list memakai `list` (jumlah item bebas, tabel item di Studio Konten).
- **K5** (c) Terbitkan template menawarkan rebase + terbit halaman terpilih, menampilkan yang akan hilang; sisanya tetap
  di versi lama dengan penanda "Perbarui".
- **K6** (c) Pengguna ≠ merchant; `merchant` → **kanal** di API/UI (struktur tetap, URL `/s/<kanal>/<halaman>`); semua
  pengguna mengelola semua kanal. Template bersama.
- **K7** (a) Belum ada gembok prop; pengaman = Kembalikan ke template + riwayat terbit.
- **K8** Empat template awal di database lewat seeder startup template-service (rilis bertanda tangan, idempoten);
  template lama `insightV*` deprecated.
- **K9** Tidak ada checker; semua pengguna menerbitkan langsung; riwayat mencatat siapa dan kapan.
- **K10** Template boleh menyimpan isi contoh; teks yang seluruhnya `[...]` = isi contoh → peringatan (tidak memblokir)
  saat Terbitkan halaman. Tanpa migrasi data.

## 6. Keputusan selama pengerjaan (2026-11-20, mengikuti rekomendasi; dilaporkan setelah selesai)

- **D1 — `list.items` boleh array langsung** (spec 2.6): baris kartu diisi di halaman (K4), selain key path data.
  Komponen ber-id di baris list kini dikunci per baris (`<list>:r<i>:<id>`), karena sebelumnya action baris
  saling menimpa (bug lama).
- **D2 — target dari data**: `navigate.screen` / `openURL.link` boleh tepat satu `{{token}}` (mis.
  `{{item.target}}`), diselesaikan saat diketuk; hasil harus identifier, bukan URL (selain itu tidak terjadi apa-apa).
  Dibutuhkan untuk "tujuan klik per kartu" (K4). `api.request` / `native.command` tetap nama literal.
- **D3 — owner template bersama `sdui`** (struktur tabel tetap, K6): template lama milik kanal tetap dipakai
  halamannya; lookup milik-kanal-dulu lalu bersama; key template baru unik di semua owner.
- **D4 — gambar template di kanal `sdui`**: gambar default yang diunggah di tab Template berlaku untuk halaman di
  kanal mana pun (pratinjau, validasi, terbit). Kanal `sdui` tidak tampil dan tidak bisa dibuat pengguna.
- **D5 — login** menerima `.` dan `-` (nama orang), scope semua kanal; kanal dibuat lewat **+ Kanal**.
- **D6 — `[Section Title]`** diberi kurung siku di template (di gambar tanpa kurung) agar ikut diperingatkan.
- **D7 — penanda versi baru**: halaman di tab Konten menampilkan "template vN tersedia"; **Perbarui** memindah
  draf (belum terbit).
- **D8 — tab Konten**: state halaman hanya bisa dicoba (deklarasi state milik template; value set tidak menyimpan state).
- **D9 — editor menyimpan root saja** (perilaku lama): `assertSameStructure` membandingkan pohon yang diedit;
  varian layout template tetap menerima nilai halaman lewat id.
- Belum: uji visual di browser (hanya unit, DOM jsdom, kontrak service, e2e API, build app); `ScreenBuilder` /
  `ValuesEditor` belum dihapus (deprecated).
