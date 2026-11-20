# Changelog — @fajekrina/sdui-r

Semua perubahan penting paket ini dicatat di sini. Format mengikuti Keep a Changelog;
versi mengikuti Semantic Versioning (0.x: breaking change boleh di minor dengan catatan jelas).

## [Unreleased]

### Ditambah: `button.iconCornerRadius` (spec 2.5)

- Latar ikon (`iconBackground`) tidak lagi harus lingkaran: `iconCornerRadius` (px) membuatnya kotak bersudut bulat,
  `0` kotak. Tanpa prop ini (atau nilai negatif) tetap lingkaran, jadi template lama tidak berubah.
- Studio: `iconCornerRadius` ada di inspector button, di sebelah `iconPadding`.

### Ditambah: spec 2.5 — pilih dan tip untuk semua jenis chart

- `SPEC_VERSION` 2.5. Properti 2.4 (`selectState`, `initialSelection`, `selectedColor`, `tip`) kini berlaku untuk
  **line, area, pie, donut**, sehingga mengganti `kind` tidak perlu mengatur ulang. Client 2.4: hanya bar yang interaktif.
- line / area: kolom per titik sebagai target sentuh (titik terdekat menurut x), **penanda bulat 10 px** (HTML, karena
  SVG yang direntang akan memipihkan lingkaran) dengan `selectedColor` atau warna garis, tip di atas titik.
- pie / donut: irisan bisa diketuk / di-hover; irisan terpilih **menonjol 4** searah sudut tengahnya (atribut
  `transform`, CSP ketat aman) dan memakai `selectedColor` bila diisi; tip **di luar irisan**, digeser menurut kuadran,
  dengan ruang di sekeliling lingkaran; entri legenda menjadi tombol (`aria-pressed`, tebal saat terpilih); tanpa
  legenda tombolnya tetap ada tetapi tersembunyi secara visual.
- Semua posisi dihitung dari data (persen), tidak diukur. Tip dan penanda bergeser; irisan berpindah seketika.
- Studio: properti pilih tampil untuk semua jenis (`CHART_KINDS`); peringatan "only work on a bar chart" dihapus;
  deskripsi menyebut batang / titik / irisan.
- Conformance: `chart_tip_line.json` dan `chart_tip_pie.json` Chromium ≡ WebKit, ketukan di kedua engine; parity tiga
  renderer. Core 29,5 KB / 32 KB.

### Diubah: tata letak pie / donut

- Default baru: lingkaran **di tengah** dan legenda **di bawah** (entri berjajar, turun baris bila perlu). Sebelumnya:
  rata kiri dengan legenda di kanan.
- `legendPosition` (`bottom` · `top` · `right` · `left`) dan `alignment` (`center` · `leading` · `trailing`) untuk pie /
  donut (spec 2.5); keduanya di inspector, hanya untuk pie / donut. Schema memeriksa `legendPosition`.
- Tip pie / donut selalu di atas lingkaran (digeser ke arah irisannya): tidak ada ruang kosong antara lingkaran dan
  legenda di bawahnya.

### Diperbaiki: tip chart terpotong, pie membingungkan, panel State untuk chart

- Tip tidak pernah keluar dari kotak chart: `left: X%` + `translateX(-X%)` (titik X% milik tip berada di X% item),
  `maxWidth: 100%`, teks panjang terbungkus. Container ber-`cornerRadius` memotong isinya (`overflow: hidden`), jadi
  `z-index` saja tidak cukup; `z-index` tip tetap dinaikkan ke 10.
- Ruang tip dihitung dari teks yang sudah terisi (termasuk baris terbungkus) untuk **semua** item — tidak meloncat saat
  pilihan berganti.
- pie / donut: tip di atas atau di bawah lingkaran (sisi terdekat irisannya), tidak di samping; garis pemisah tipis
  berwarna latar antar-irisan; kotak warna legenda mengikuti `selectedColor`; irisan yang ditarik keluar tidak lagi
  terpotong (`overflow: visible`). Studio memperingatkan pie / donut yang semua irisannya satu warna.
- Panel State: state milik chart menawarkan key item (dari data statis atau contoh data sumbernya), "(initial pick)" dan
  "(no pick)"; tanpa kolom `initial` ("picked by chart #id"). Sumber data chart tidak lagi didaftar sebagai request
  (tidak pernah dikirim oleh tap). Baris panel dirapikan.

### Diubah: budget ukuran core 30 → 32 KB

- Keputusan 2026-11-19, untuk spec 2.5 (pilih dan tip untuk line, area, pie, donut). Core saat ini 28,9 KB.

### Diubah: inspector chart mengikuti `kind`

- Studio hanya menampilkan properti yang dibaca jenis chart itu (`CHART_KINDS`, `chartReads`): `color` / `min` / `max`
  untuk bar · line · area, `showLegend` untuk pie · donut, properti pilih 2.4 untuk bar; `height` pie / donut berlabel
  "height (diameter)".
- Mengganti `kind` tidak membuang nilai: properti yang tidak dibaca jenis baru tetap tersimpan, didaftar ("Not used by
  a pie chart: …") dengan tombol **Remove** (satu langkah undo); kembali ke jenis lama memakainya lagi.

### Ditambah: spec 2.4 — chart interaktif (bar)

- `SPEC_VERSION` 2.4 (hanya properti; client 2.3 menampilkan grafik statis). Chart `bar`: `selectState` (batang yang
  diketuk menulis `$selected.<state>` = key item, atau indeksnya), `initialSelection` (`last` · `first` · `none` · key;
  dihitung ulang terhadap data seperti `initial`), `selectedColor`, `tip` (`{{item.<field>}}` dari item terpilih,
  markup tebal/miring, baris baru).
- Posisi tip **dihitung** dari data (pusat / tepi batang dan puncaknya dalam persen), tidak diukur — sama di semua
  engine; ruang di atas batang tertinggi disediakan. Tip bergeser ke batang baru (`Motion.from`, `MOVE_MS` 200 ms;
  tidak saat render pertama, preview statis, atau reduced motion).
- Tombol transparan per batang (target sentuh, bisa difokus, `aria-label` = label + `amount` / nilai, `aria-pressed`);
  chart menjadi `role="group"`; tip `aria-live="polite"`. Mengetuk batang terpilih tetap memilihnya.
- Hover mouse di web **mempratinjau** tip tanpa mengubah state: `RenderNode.on.hover` / `hoverEnd`,
  `ScreenController.hover`; vanilla, React, dan Vue mengikat `pointerenter` / `pointerleave` (mouse saja). Vanilla
  mengabaikan `pointerleave` dari node yang sudah dilepas (WebKit mengirimnya setelah repaint → loop render).
- Studio: grup Choice pada chart — `tip` (daftar field item dari data / contoh data; mengisi `selectState` otomatis),
  `selectState`, `initialSelection` (termasuk key item), `selectedColor`; state chart muncul di panel State;
  peringatan untuk properti pilih di chart non-bar dan tip yang tidak pernah tampil.
- Conformance: `chart_tip.json` Chromium ≡ WebKit, tip mengikuti batang di kedua engine, CSP ketat dengan animasi geser.
- Core 28,9 KB / 30 KB.

### Diubah: budget ukuran core 28 → 30 KB

- Keputusan 2026-11-19, untuk spec 2.4 (chart interaktif: pilih batang, tip bawaan, hover). Core saat ini 27,6 KB.

### Ditambah: spec 2.3 (tahap 1, bentuk dokumen) — state halaman dan transisi

- `SPEC_VERSION` naik ke **2.3**. Tanpa komponen baru dan tanpa action type baru, jadi client 2.2 tetap
  menampilkan layar 2.3 (properti barunya diabaikan; lihat tabel di `spec/README.md`).
- Template / screen `state`: state bernama (`$selected.<nama>`, tempat grup pilihan 2.2 menulis) dengan
  `initial` yang boleh berisi `{{token}}` — wadah untuk pilihan yang nanti disimpan backend.
  `TemplateSpec.state`, `ScreenSpec.state`, `compose`, `EditorDocument.state` / `setScreenState`,
  `mergeContent` / `splitContent` membawanya (state adalah desain, bukan konten).
- Schema: `#/$defs/nodeProps` memeriksa bentuk `visibleWhen` / `disabledWhen` / `maskedWhen` (satu sumber
  `state` atau `request`, satu operator `equals` · `notEquals` · `in` · `empty` · `notEmpty`), `transition`
  (`visible`: none · fade · collapse) dan `toggle`. Client tetap lunak (fallback per prop saat render).
- Bounds: `maxStates` (16), `maxConditionValues` (16).
- Fixture: `template_insight.json` naik ke 2.3 (umpan balik suka / tidak suka), `template_wallet.json`
  (saldo + mata), `template_banner.json` (banner yang bisa ditutup), dan 6 fixture invalid.

### Ditambah: spec 2.3 (tahap 1, engine) — kondisi, toggle, status request

- Kondisi dievaluasi saat render (`evaluate`, `RenderContext.when` / `disabled` / `masked`): `visibleWhen`
  menyembunyikan komponen (tidak memakan tempat), `disabledWhen` menonaktifkan button (tanpa handler) dan
  field, `maskedWhen` mengganti teks dengan `••••••` (termasuk label a11y-nya: nilainya tidak sampai ke view).
  Kondisi yang tidak bisa dievaluasi (operator minor berikutnya, bentuk salah): `visibleWhen` → tampil,
  `disabledWhen` → aktif, `maskedWhen` → tetap tersamar.
- `button.toggle`: tap membalik state antara `"on"` dan `""` (sebelum action-nya jalan); `"on"` = terpilih
  (`aria-pressed`, warna `selected*`).
- `$request.<request>`: `pending` → `success` · `error` untuk setiap action `api` (`ActionContext.requestStatus`).
- State yang dideklarasikan mengikuti `initial` (di-resolve ulang terhadap data) sampai di-set oleh tap — pilihan
  yang disimpan backend dan dikembalikan lewat `load` muncul lagi tanpa mengubah template.
- **K5:** action dengan type yang tidak dikenal (minor berikutnya) tidak lagi menggagalkan seluruh layar: dilewati
  saat decode (beserta langkah sesudahnya), tidak pernah dijalankan, dan dilaporkan sekali lewat event
  `action_unsupported`. `ActionSpec.decode` (authoring / Studio) tetap menolaknya, dan schema tetap menolaknya
  di CI dan backend. `ActionSpec.decodeStep`, `ActionSpec.skipped`, `SduiNode.skippedAction`.
- Simbol `eye` dan `eye.slash` (outline).
- Budget ukuran core dinaikkan 26 → 28 KB (keputusan 2026-11-19); sekarang 26,1 KB.
- Belum: animasi `transition` (fase 3) dan panel Studio (fase 4). Sampai fase 4, canvas Studio juga
  menyembunyikan komponen yang `visibleWhen`-nya tidak terpenuhi pada state kosong.

### Ditambah: spec 2.3 (tahap 1, render) — animasi `transition`

- `transition.visible`: `fade` (200 ms) dan `collapse` (250 ms, menyusut mengikuti sumbu induknya: lebar di
  `hstack`, tinggi di tempat lain). Core yang mengatur waktunya (`ScreenController` mengingat apa yang terakhir
  ditampilkan tiap key) dan menaruhnya di `RenderNode.motion`; ketiga renderer memutarnya dengan
  `playMotion` (Web Animations API — tanpa stylesheet, tanpa atribut `style`, CSP ketat tetap aman). Delay
  negatif = waktu yang sudah berjalan, jadi DOM yang dibangun ulang di tengah animasi (vanilla) tetap mulus.
- Komponen yang sedang keluar: `inert` + `aria-hidden`, tanpa handler, lalu dihapus. Render pertama, preview
  statis (canvas Studio) dan `prefers-reduced-motion` tidak pernah dianimasikan. Opsi engine baru:
  `reducedMotion` dan `now`.
- Fokus: `holdFocus` (dipakai vanilla, React, Vue) memindahkan fokus yang dipegang komponen tersembunyi (✕ yang
  menutup banner-nya sendiri) ke leluhur terdekat yang masih tampil. React dan Vue kini juga menulis
  `data-sdui-key` ke DOM, sama seperti vanilla.
- `RenderContext.layout` (`column` · `row` · `block`): bagaimana induk menata anaknya.
- Budget core 27,2 / 28 KB.

### Ditambah: spec 2.3 (tahap 1, Studio) — state, kondisi, simulasi, Preview hidup

- Inspector: grup **State** — editor kondisi (`visibleWhen` di semua komponen, `disabledWhen` di button dan
  field, `maskedWhen` di text): state atau request → operator → nilai, dipilih dari nilai yang bisa diberikan
  tombol halaman (tidak diketik); `transition` (none · fade · collapse). `toggle` di grup Choice.
- Panel **State** (kolom kiri): state halaman (dideklarasikan + grup / toggle tombol), `initial`, tambah / hapus,
  dan **try** — nilai simulasi state dan hasil request untuk kanvas. Komponen yang tersembunyi diberi ◐ dan pudar
  di Outline; yang dipilih tetap digambar samar di kanvas (`data-sdui-hidden`, opsi core `reveal`).
- **Preview** kini menjalankan halaman dengan engine client (tap, `$request`, animasi); request dijawab sesuai
  pilihan try (berhasil ±0,6 dtk · error · pending).
- `stateWarnings`: kondisi yang tidak bisa diubah tombol mana pun, state yang tidak pernah ditulis (untuk
  `maskedWhen`: saldo tidak bisa dibuka), request yang tidak dikirim, transition tanpa visibleWhen, state yang tidak
  dipakai, kondisi yang tidak terbaca. `describeComponent` menjelaskan kondisi, transition, toggle.
- API builder baru: `stateNames`, `stateValues`, `requestNames`, `conditionParts` / `conditionOf`,
  `describeCondition`, `describeStateProps`, `simulatedState`, `conditionEditor`.
- Service: `SpecContract` menerima 2.3 sejak tahap 1 (bentuk kondisi diperiksa schema; 422 untuk yang salah).
- Dokumen: `spec/README.md` (State and transitions), `README.md`, `DESAIN-ARSITEKTUR-SDUI.md`, dan manual editor
  (5.4 Interaksi tanpa kode + peringatan baru).

### Ditambah: spec 2.3 — tipografi teks

- `text.font` (nama font, bukan CSS: `rounded` · `serif` · `mono` bawaan; app memetakan nama apa pun lewat
  `--sdui-font-<nama>`), `text.transform` (`uppercase` · `lowercase` · `capitalize`), `text.letterSpacing` (px,
  -5…20), `text.lineHeight` (kelipatan ukuran, 0,8…3; default 1,3). `typography(node)` dan `FONT_STACKS` di core.
- Schema memeriksa bentuknya (nama identifier, enum, rentang); client mengabaikan nilai yang salah.
- Studio: pilihan font (bawaan + `catalog.fonts` dari app), `transform`, `letterSpacing`, `lineHeight` di grup Style.

### Diperbaiki

- Gambar tanpa `width` di dalam flex column (`vstack`, `card`, `form`) kini `width: auto; max-width: 100%;
  align-self: stretch` — kotaknya sama, tetapi WebKit tidak lagi menghitung tingginya dari border box kolom
  (padding ikut terhitung). Conformance `template_insight.json` Chromium ≡ WebKit lolos lagi (selisih 27,5 px).
- Conformance: tes animasi di Chromium dan WebKit (`conformance/motion.spec.ts`), dan halaman CSP ketat kini
  ikut menjalankan fade dan collapse.

### Ditambah: desain dan konten di satu editor, tetap disimpan terpisah

- `mergeContent(template, values)` (builder): menulis konten value set ke komponen template, jadi satu pohon
  yang diedit Studio (desain + isi). Konten untuk id yang sudah tidak ada, atau prop yang bukan konten, dibuang
  dan dilaporkan di `dropped`.
- `splitContent(document, screen?)` (builder): pohon Studio → **template tanpa konten** + **value set** berisi
  prop konten (`isContentProp`) tiap komponen, untuk versi template yang sedang didraf. Template dan value set
  tetap disimpan, diterbitkan, dan ditandatangani terpisah; client tetap menyusunnya dengan `compose`.
- Deprecated: `mountScreenBuilder`, `ValuesEditor`, dan `<SduiScreenBuilder />` (React/Vue) — konten kini
  diisi langsung di Template Builder.

### Ditambah: spec 2.2 — layout penuh, tumpang-tindih, outline, ikon & pilihan di button

- `SPEC_VERSION` naik ke **2.2** (aditif: prop dan simbol baru, tanpa komponen baru). Dokumen 2.0/2.1 tetap valid.
- Layout: `vstack.alignment: fill` dan `card.alignment` (`leading` default · `center` · `trailing` · `fill`) —
  anak selebar kontainer; `card.spacing`; **`vstack.spacing` negatif** = anak berikutnya ditarik ke atas dan
  menimpa anak sebelumnya (mis. kartu yang setengahnya di atas latar berwarna).
- Prop bersama: `paddingHorizontal` / `paddingVertical` (menimpa `padding` di sisinya), `borderColor` +
  `borderWidth` (outline; lebar default 1), `shadow` (`small` · `medium` · `top`), `pin` (`bottom` · `top`:
  tetap terlihat di tepi layar saat halaman digulir — footer tombol).
- `button`: ikon `systemName` di depan judul atau di atasnya (`iconPosition: top`), `iconSize`, `iconPadding`,
  `iconBackground` (lingkaran), `iconForeground`; `size` dan `weight` judul.
- **Pilihan** (`button.group` + `value`): tap memilih nilai itu di grupnya (`$selected.<group>` di data layar,
  satu nilai per grup) — action boleh tidak ada; bila ada, jalan setelah memilih dan bisa membaca
  `{{$selected.<group>}}`. Tombol terpilih memakai `selectedBackground` / `selectedForeground` /
  `selectedIconBackground` / `selectedIconForeground` dan `aria-pressed="true"`. Event `choice_selected`.
- Simbol: `arrow.left`, `hand.thumbsup`, `hand.thumbsdown` (outline). `Symbols.register(name, path,
  { stroke: true })` mendaftarkan glyph garis (lebar 2, sudut bulat).
- Studio: semua prop di atas ada di inspector (grup baru **Choice**), `systemName` menyarankan simbol bawaan, dan
  opsi `uploadAsset` membuat field `name` gambar di Template Builder punya tombol unggah: gambar menjadi gambar
  default template (pembuat konten tetap bisa menggantinya). `AssetSource` / `IMAGE_TYPES` kini dari `./studio`
  (tetap diekspor ulang dari screen-builder).
- Fixture `spec/fixtures/valid/template_insight.json`: halaman "Insight buat kamu" yang memakai semuanya.
- Budget core **24 → 26 KB** (keputusan, sesuai catatan di `scripts/size.mjs`): spec 2.2 menambah ±1,1 KB gzip
  (prop bersama, ikon/pilihan button, glyph garis); core sekarang ±25,0 KB.

### Ditambah: spec 2.1 — `text.align`, `text.markup`

- `SPEC_VERSION` naik ke **2.1** (aditif: hanya prop baru, tanpa komponen baru). Dokumen 2.0 tetap valid
  dan tetap dirender; backend menerima 2.0 dan 2.1 dan menandatangani sebagai 2.1.
- `text.align`: `leading` · `center` · `trailing`. Teks selalu tampil penuh: semua baris `value`, baris baru tetap
  baris baru, tidak pernah dipotong dengan "…" (`maxLines` dari draf awal 2.1 dihapus dan diabaikan bila ada).
- `text.markup: true`: `**tebal**` dan `*miring*` di `value` (boleh bertumpuk); `\*` = bintang literal; penanda
  tanpa pasangan tetap literal. Opt-in per teks, jadi teks lama tidak berubah tampilannya. Diparse dari string
  **template sebelum** `{{token}}` diganti — data (jawaban API, isian form) tidak pernah menjadi format.
  Kosakata tertutup: tanpa HTML, link, atau warna. `parseMarkup` diekspor dari core untuk host native.
- Budget core tetap 24 KB (23,9 KB setelah perubahan).

### Diubah: satu peran admin, terbit langsung (builder) — BREAKING

- Dihapus: `readOnly` dan `onSubmitForReview` (Studio, Screen Builder, React/Vue), catatan review, dan tombol
  "Submit for review". Tidak ada lagi peran reviewer/maker-checker; `onPublish` menerbitkan langsung.
- Screen Builder menjadi **editor konten**: `onPublish` baru, dan `showTemplates: false` menyembunyikan daftar
  template (template halaman sudah pasti) — dipakai sebagai tab "Isi konten" di Studio.
- `templateScreenProvider` mengambil template milik merchant: `GET {basePath}/templates/{merchantId}/{key}/v{n}`
  (setiap merchant memiliki template sendiri; delivery-service mengikuti).

### Diubah: panel action mengikuti apa yang dilakukan komponen (builder)

- `ComponentInfo.action` (`ActionUse`): `tap` (button, dan komponen custom secara default), `source` (chart),
  `none` (komponen bawaan lain). Komponen custom bisa menyatakannya (`static action` / `register(…, { action })`).
- Studio: bagian "Interaction" hanya untuk `tap`. Chart mendapat bagian "Data source" yang terkunci ke `api`
  (pilih sumber + params; tanpa tipe action dan tanpa `onSuccess`/`onError`). Komponen `none` yang masih membawa
  action menampilkan "Action (ignored)" dengan tombol hapus.
- `describeComponent(node, factory?)` hanya menyebut "Tappable" untuk komponen `tap`; `actionWarnings(root, lists,
  factory?)` memperingatkan action yang tidak pernah jalan (mis. di `card`/`text`) dan action chart selain `api`.
  `actionUseOf(type, factory?)` diekspor.

### Diubah: perubahan tampil langsung saat mengetik (builder)

- Field teks, textarea, angka, dan opsi picker memperbarui kanvas di setiap ketikan (event `input`), di Studio
  maupun editor konten — tidak perlu meninggalkan kolom. Fokus dan posisi kursor tetap di kolom yang sama walau
  inspector digambar ulang (`focusOf` / `restoreFocus`).
- Satu sesi mengetik di satu field = satu langkah undo: `EditorDocument.setProp(id, key, value, { typing: true })`,
  `ValuesEditor.setValue(…, { typing: true })`; sesi berakhir saat kolom ditinggalkan (`endTyping()`), memilih
  komponen lain, atau undo/redo.

### Diubah: inspector Studio dikelompokkan, field terstruktur (builder)

- Grup yang bisa dilipat: Content · Field · Data · Layout · Style · Accessibility, lalu Interaction/Data source dan
  Props (JSON). `groupOf(type, key)` dan `GROUPS` diekspor.
- `text.value` berupa textarea multi-baris (Enter = baris baru) dengan tombol **B** / *I* yang membungkus seleksi
  dan menyalakan `markup`. Di editor konten tombol itu hanya muncul bila template menyalakan `markup`.
- Opsi `picker` berupa tabel (value + label, tambah/hapus/urutkan); warna berupa token tema atau hex (color
  picker); `list.items` dipilih dari request `screen.load` atau key path. Kontrol diekspor (`multilineText`,
  `optionsTable`, `colorField`).

### Diubah: action editor hanya menampilkan yang dipakai engine (builder)

- `openURL`: `link` dipilih dari daftar `links` ("— choose a link —", nilai lain "unknown link"); tanpa `params`
  dan tanpa `onSuccess`/`onError`. `dismiss` / `refresh`: hanya keterangan. `navigate` / `toast`: hanya `onSuccess`
  (tidak bisa gagal); `api` / `native`: `params`, `onSuccess`, `onError`.
- Field yang diabaikan engine tetap tampil selama masih berisi (berlabel "ignored … clear it" / "never runs …
  remove it") supaya bisa dihapus; tidak ada yang dibuang otomatis.
- `actionWarnings(root, { requests, sources, links })` (menggantikan pemakaian `requestWarnings` di Template
  Builder): ditambah link yang tidak dikenal, `params` yang diabaikan, dan langkah lanjutan yang tidak pernah jalan.
  `describeAction` hanya menyebut langkah yang benar-benar jalan. `ACTION_USES` mencatat aturannya.

### Diubah: daftar request tombol dan sumber data chart dipisah (builder)

- `StudioOptions.sources` / `StudioCatalog.sources` (juga prop `sources` di React/Vue): sumber data yang dibaca chart.
  Action `api` milik chart memilih dari `sources` ("— choose a data source —", nilai lain ditandai
  "not a data source"); tombol dan komponen lain memilih dari `requests` (nilai lain "unknown request").
- Tanpa `sources` chart tetap memakai `requests` seperti sebelumnya. Runtime, payload dan validator tidak berubah:
  template yang sudah rilis tetap jalan, nilai yang salah jenis ditampilkan apa adanya, tidak dibuang.
- App: `CATALOG.requests` = request aksi (`submitCheckout`), `CATALOG.sources` = `DATA_SOURCES`.
- Peringatan `requestWarnings(root, { requests, sources })` (diekspor dari builder), tampil di panel
  peringatan Template Builder: tombol (atau langkah `onSuccess`/`onError`) yang mengirim sumber data chart,
  chart yang membaca request aksi, atau nama yang tidak ada di daftar mana pun. Hanya peringatan, tidak
  memblokir simpan/terbit, dan hanya aktif jika app memisahkan daftar (`sources` diisi).

### Ditambahkan: deprecated, keterangan fungsi, bingkai gambar (builder)
- **Template deprecated** (status katalog per key template, bukan isi dokumen bertanda tangan): Template Builder
  punya tombol "Deprecate…" (alasan wajib, pengganti opsional dari template lain yang tidak deprecated) dan banner +
  "Restore" saat deprecated. Opsi baru `deprecation`, `onDeprecate`, `onRestore`; `catalog.deprecated` menandai
  template di pemilih page `navigate`. Screen Builder: `TemplateChoice.deprecated` → badge di palette dan banner.
  Page yang sudah memakai template tetap jalan; page baru ditolak (app dan value-service).
- **Keterangan fungsi untuk maker**: `describeComponent` / `describeAction` / `actionBadge` (mis. "Opens page
  "checkout" as a sheet", "Sends request …; on success: …", field form, sumber data chart, bingkai gambar). Screen
  Builder menampilkannya di inspector ("What it does"), badge di outline dan kanvas (`→ checkout`, `⇄ submitCheckout`),
  dan tooltip. Template Builder: prop `builderNote` ("note for makers") per komponen — milik template, bukan konten,
  dan dibuang oleh `compose` (tidak sampai ke nasabah).
- **Bingkai gambar**: `image` baru dari palette = bingkai kosong (`defaultProps` `{ height: 160 }`, sebelumnya ikon
  `star.fill`). Tanpa gambar, renderer menggambar bingkai (`data-sdui-frame="empty"`, atau `"missing"` bila nama tak
  dikenal) alih-alih `<img src="">`. `name` yang ter-resolve kini **mengalahkan** `systemName`, jadi foto maker
  menggantikan ikon template. Screen Builder: panel "Picture" (pratinjau, drop zone, "Choose file…", "Use link") dan
  drop file langsung ke bingkai di kanvas; opsi `uploadAsset(source) → nama aset` dan `maxAssetBytes` (default 2 MiB);
  hanya PNG/JPEG/WebP/GIF (`IMAGE_TYPES`, tanpa SVG). Value set tetap hanya berisi nama aset, tidak pernah URL.

### Diubah
- Template Builder: **component id tidak bisa diedit** (read-only; dibuat sekali `text1`, `button2` …, karena value
  set memakainya sebagai key). **Breaking:** `EditorDocument.renameId` dihapus. Panel JSON (2-way) Template Builder
  juga tidak bisa mengganti id: `importJSON(data, { keepIds: true })` menolak id baru atau id yang dipindah ke
  komponen bertipe lain; menghapus komponen dan menambah komponen tanpa `id` (id dibuat otomatis) tetap boleh.
  Import berkas utuh (tombol Import, draft dari backend) tetap memakai id dari berkasnya.
- Template Builder: **id tidak pernah dipakai ulang**. `EditorDocument` mengingat setiap id yang pernah ada (beserta
  tipenya); id baru melewatinya, jadi menghapus `text1` lalu menambah text memberi `text2`/`text3`, bukan `text1` lagi
  (value set lama tidak menempel ke komponen lain). Baru: `reserveIds(templateJSON | ids)` untuk id dari release
  sebelumnya; app memanggilnya untuk setiap release template yang dibuka. Panel JSON boleh mengembalikan komponen
  terhapus dengan id-nya sendiri (tipe sama), tidak boleh memberi id itu ke tipe lain.
- **`order` = posisi di seluruh halaman** (depth-first dari root: root 0, anak pertamanya 1, cucu pertamanya 2 …),
  bukan lagi indeks per saudara yang selalu mulai dari 0. Memindahkan komponen menomori ulang semua node sesudahnya.
  Tetap memenuhi spec (unik dan menaik di antara saudara). `ordersOf(root)` memberi nomor per id; inspector menampilkannya.
- Budget core terukur 23,5 KB (budget 24 KB).

### Ditambahkan: data chart dari API
- Sumber data chart = **action chart**: action `api` dengan `request` (dan `params`) yang dipilih. `compose` menambahkannya
  ke `screen.load` (sekali), jadi data ikut diambil bersama halaman. Respons berupa **data summary**
  `{ items: [{ key, label, value }] }` (atau array-nya langsung) yang dipetakan otomatis; mapping lain lewat `keyKey` /
  `labelKey` / `valueKey`. Tanpa action (atau action selain `api`), chart menggambar `data` statisnya. Chart tidak bisa
  di-tap. Tidak ada prop `source` terpisah. Di Template Builder, bagian Action pada chart berjudul "Action · data source".
- Checkbox tampilan chart: `showLabels` (default on), `showKeys` (baru), `showValues`, `showLegend` (default on), berlaku
  untuk bar/line/area dan legenda pie/donut. Builder: checkbox ber-default on menulis `false` saat dimatikan.
- Template Builder: `navigate.screen` (dari `screens`; di app: semua template) dan `api.request` (dari `requests`) kini
  berupa pilihan, bukan teks bebas. Nilai di luar daftar ditandai "(not a template)" / "(unknown request)"; action
  navigate/api baru langsung menunjuk entri pertama.

### Diubah (breaking): value set hanya berisi konten
- Maker hanya mengisi **konten**: per tipe komponen, prop di `spec/content.json` / `CONTENT_PROPS` (`text.value`,
  `image.name`/`systemName`, `button.title`, `list.items`, `label`/`placeholder` field form, `picker.options`,
  `chart.data`/`labels`/`labelKey`/`valueKey`) ditambah `a11yLabel`. Style, layout, aturan form, dan action milik template.
- `validateValues` menolak prop non-konten ("not content of a text — the template decides it"); value set tidak lagi
  punya `action` (dihapus dari skema `componentValue`; `ValueSet.decode` menolaknya). `compose` selalu memakai action
  template. Tipe di luar daftar (slot adapter) tidak punya prop konten.
- `ValuesEditor`: `setAction` dihapus; baru `editable(id, key)` dan `node(id)`; `setValue` menolak prop non-konten;
  `importJSON` memvalidasi terhadap template; `setTemplate` membuang prop yang bukan konten tipe barunya.
- Screen Builder: inspector hanya menampilkan field konten (field style/layout dan editor action hilang).
- Fixture: `values_promo` / `bundle_promo` tanpa action; `invalid/values_raw_url` → `invalid/values_action`.

### Ditambahkan
- Komponen bawaan **`chart`**: `kind` bar | line | area | pie | donut, digambar sebagai SVG `path` (identik di React/Vue/vanilla,
  aman di CSP ketat). `data` berupa array angka atau objek (`labelKey`/`valueKey`, `color` per item), atau key path ke
  data layar (`"getSales.items"` / `"{{getSales.items}}"`, mis. hasil `screen.load`; skeleton saat belum tiba). Juga `labels`,
  `color`, `height`, `min`/`max`, `showValues`, `showLegend`, `a11yLabel` (default: ringkasan otomatis, `role=img`).
  Field-nya tersedia di kedua builder. Fixture `valid/chart_dashboard.json` masuk gerbang paritas renderer.
- Screen Builder: panel Templates dan panel Values JSON bisa dibuka/tutup; komponen terpilih di-highlight di JSON
  (`findValueJsonRange`).
- **Ukuran ditentukan wadah, perilaku oleh `scroll`**: `height` / `maxHeight` (px, tinggi total termasuk padding) pada
  `vstack`, `card`, dan `grid`; `grid.rowHeight` membuat baris seragam. Wadah yang dibatasi memotong isi yang tidak muat;
  `scroll` di dalamnya mengisi sisa ruang dan men-scroll (mis. `card(maxHeight) → vstack → [judul, scroll → daftar]`:
  judul tetap, daftar di-scroll). Diverifikasi di Chromium. `scroll` sendiri tidak punya ukuran.
- Builder memperingatkan wadah yang dibatasi tapi isinya terpotong ("put a scroll inside"), diukur di kanvas
  (`clippedContainers`); di Screen Builder juga saat teks maker melebihi wadah template.
- Outline di kedua builder: panel bisa dibuka/tutup, dan tiap komponen yang punya anak bisa dilipat (▾/▸); pilihan dari
  kanvas membuka induknya. Teks panjang di kolom builder diakhiri "…" dengan tooltip (tanpa scroll horizontal).

### Diubah
- Slot milik adapter (`render({ slots })`) kini mengalahkan komponen bawaan bernama sama, jadi app tetap bisa menggambar
  `chart` dengan toolkit sendiri.
- Budget bundle core 22 → 24 KB (terukur 23,0 KB) untuk `chart` dan aturan konten.

## [0.1.0] — sdui-r

Fork dari `@fajekrina/sdui` (`feat/hld-target-f1` @ `dd09541`, semua F1–F5 HLD Target ikut). Konsep berubah
dari **menyusun komponen** menjadi **memilih template + mengisi value**.

### Ditambahkan
- **Spec 2.0** (`spec/sdui.schema.json`): dokumen **template** (`{ schemaVersion, template: { key, version, title?,
  load?, root, variants? } }`) — setiap node wajib `id` dan `order`; dokumen **value set** (`{ schemaVersion,
  values: { screen, template: { key, version }, components: { <id>: { props?, action? } } } }`); **bundle**
  `{ template, values? }` (unit transport + cache). Fixture valid/invalid baru untuk ketiganya.
- Node: field `order` (integer ≥ 0) — urutan render di antara saudara, bukan posisi array.
- Core: `TemplateSpec`, `TemplateDocument`, `ValueSet`, `ValuesDocument`, `compose(template, values?)`
  (urut per `order`, props value di-merge dangkal di atas default template, aksi value menggantikan aksi template,
  varian memakai id yang sama), `isScreenBundle`, `bundleBytes`.
- `SchemaValidator.validateTemplate` (id wajib + unik per pohon, `order` wajib + unik antar saudara, versi ≥ 1) dan
  `validateValues` (template `key@version` harus sama, id harus ada di template, bounds props/aksi).
- Engine: `materialize` menerima bundle (kedua bagian **diverifikasi terpisah**, setiap kali — termasuk dari cache),
  template saja (pratinjau), atau screen hasil compose. Value set untuk screen lain ditolak (anti-substitusi);
  value set tanpa template ditolak.
- `templateScreenProvider` (`./browser`): value set dari `{basePath}/screens/{mid}/{key}[/{version}]` (ETag/304),
  lalu template `{basePath}/templates/{key}/v{version}` (immutable, LRU di memori) → bundle ke engine.
- **Dua builder** (`./builder`, React + Vue):
  - **Template Builder** (`mountTemplateBuilder`, `<SduiTemplateBuilder>`) — admin: palette komponen, id komponen
    yang terbaca (`text1`, `button2`, bisa diganti di inspector), `order` dari posisi, versi + judul template;
    output = dokumen template. `EditorDocument({ mode: 'template' })`, `templateDocument()`, `renameId()`.
  - **Screen Builder** (`mountScreenBuilder`, `<SduiScreenBuilder>`) — maker: palette **template**, struktur terkunci,
    inspector mengisi value per komponen (default template sebagai placeholder, ↺ kembali ke default), override aksi;
    output = value set. Model headless `ValuesEditor`; `readOnly`, `baseline` (diff), `onSubmitForReview`.

### Diubah (breaking terhadap sdui)
- `SPEC_VERSION` 2.0, `SUPPORTED_MAJOR` 2: payload 1.x ditolak (`unsupportedVersion`).
- Nama paket `@fajekrina/sdui-r`, repo `github.com/fajekrina/sdui-r`.
- Budget bundle core 20 → 22 KB (terukur 20,8 KB) untuk composer template + validasi value set.

## Riwayat @fajekrina/sdui (sebelum fork)

### [Unreleased di sdui saat fork]

Studio mengadopsi alur kerja builder 0.3.0 (`FajrinaBuilder`) di atas arsitektur sekarang:
model `spec/`, 16 komponen builtin, aksi tertutup, target bernama, satu Studio DOM untuk React dan Vue.

### Ditambahkan
- **Drag-and-drop**: dari palette ke canvas atau outline (sisip), dan node ke posisi lain (pindah);
  drop `inside` container, atau `before`/`after` sebuah node, dengan penanda drop. Klik palette tetap menyisipkan.
- **Pemilih parent** di inspector: pindahkan node ke container lain.
- **Mode Preview**: canvas penuh tanpa palette, inspector, panel JSON, dan penanda editor.
- **Editor aksi terstruktur**: form per tipe aksi (target, `presentation`, pesan/level `toast`, `params`) dengan rantai
  `onSuccess`/`onError` bersarang hingga `maxChainDepth`; JSON aksi mentah tetap tersedia.
- Opsi `StudioOptions` / props `<SduiBuilder>`: `screens`, `requests`, `links`, `commands` (daftar nama dari allow-list
  aplikasi untuk editor aksi — nama, bukan URL) dan `title` (label toolbar).
- Status simpan/publish di toolbar (`Saved ✔`, `Published ✔`, `Save failed: …`).
- Canvas: petunjuk container kosong, label node terpilih, tooltip tipe/id.
- `EditorDocument`: `isContainer`, `placement`, `parentCandidates`, `reparent`.
- `MountedStudio.update(options)`: `title`, `screens`/`requests`/`links`/`commands`, `sampleData`, `assetURL` bisa
  berubah setelah mount (mis. daftar screen dari backend); `<SduiBuilder>` React/Vue meneruskannya otomatis.

### Ditambahkan — HLD Target F1 (kontrak & integrasi)
- `./browser`: **`specScreenProvider({ basePath, merchantId, credentials?, traceHeaders? })`** — `ScreenFactory` untuk spec
  screen: `GET {basePath}/screens/{mid}/{key}/{version}` bila manifest menyebut versi (immutable, bisa di-cache CDN),
  selain itu `GET {basePath}/screens/{mid}/{key}`. Versi yang bukan satu segmen path ditolak (`schema`); 404 →
  `unknownScreen`; `credentials` default `same-origin`, hanya `omit`/`same-origin`.
- `./browser`: **`specManifestLoader({ basePath, merchantId })`** — `GET {basePath}/manifest/{mid}` untuk `manifestLoader`.
- Core: provider menerima `version` (versi dari manifest yang diterapkan) — `ScreenProviderOptions`; aditif.
- **`spec/bounds.json`** — sumber tunggal default `SduiBounds`: core mengimpornya dan bundler menanam angkanya saat
  build (tidak ada angka literal lagi di `bounds.ts`); backend membaca berkas terbit yang sama. Gerbang
  `tests/spec.test.ts` gagal bila schema berbeda dengan `bounds.json`.
- `exports`: `./spec/*` (schema, `bounds.json`, `fixtures/**`) dan `./package.json`.
- `npm run test:contract` — uji kontrak terhadap universal-service asli dalam mode `signed`
  (`SDUI_E2E_BASE_URL=…/universal/v1`): manifest bertanda tangan → layar berversi, publish fixture → versi baru,
  envelope yang diubah ditolak.

### Ditambahkan — HLD Target F2 (revalidasi & BFF)
- Kontrak provider: `ScreenProviderOptions.etag`; provider boleh membalas `{ bytes, etag }` atau — hanya bila diberi
  `etag` — `{ notModified: true }` (`ScreenProviderResult`, `ScreenFactory.resolve`). ETag disimpan bersama entri cache;
  revalidasi layar tanpa versi mengirim `If-None-Match`, `304` → event `screen_not_modified`, tanpa unduh/decode/render.
- `specScreenProvider`: `If-None-Match` / `304` / header `ETag`.
- `fetchNetworkClient`: `credentials` (`omit` default, `same-origin` untuk sesi BFF; `include` ditolak) dan `traceHeaders`.
- `EngineInit.maxEnvelopeBytes` (default 1 MiB): bytes layar/manifest yang lebih besar ditolak sebelum decode
  (`SduiError.bounds`, event `envelope_too_large`).

### Ditambahkan — HLD Target F3 (PWA & offline)
- Port **`ConnectivityPort`** (`EngineInit.connectivity`, default selalu online). Offline: engine tidak menyentuh jaringan,
  memakai layout terverifikasi terakhir (`origin: 'offline'`) atau gagal `SduiError.network`; `api` gagal cepat ke
  `onError` tanpa request; `screen.load` tidak dijalankan (`$load.<request> = "error"`, `$offline`). Kembali online:
  `refreshManifest()` lalu layar memuat ulang datanya; event `connectivity_changed`.
- **Last-good dipersist**: penunjuk tersegel per key (`sdui:lastgood:<key>`) di `CacheStore`, hanya diperbarui setelah
  verifikasi + validasi sukses; bytes yang ditunjuk diverifikasi ulang saat dipakai (L-2).
- Entry baru **`./pwa`**: `connectivity({ probeUrl?, intervalMs? })` dan `onServiceWorkerUpdate({ canApply, onAvailable })`
  (alur "versi baru tersedia" yang menunggu `canApply()`, mis. tanpa `hasPendingUpdate`). Budget 1 KB (terukur 0,7 KB).

### Ditambahkan — HLD Target F4 (CSP ketat)
- Studio tanpa `<style>` inline: stylesheet dipasang sebagai constructable stylesheet (`adoptedStyleSheets`, juga di
  shadow root) dan dilepas saat `destroy()`; opsi `stylesheet: 'external'` + berkas terbit
  `@fajekrina/sdui/builder/studio.css`. Atribut `style` di Studio diganti kelas / CSSOM.
- Renderer vanilla, React, dan Vue mengabaikan `attrs.style` dan `on*` (style hanya lewat CSSOM).
- Gerbang `tests/csp.test.tsx`: tidak ada sink Trusted Types (`innerHTML`, `insertAdjacentHTML`, `eval`, …), string
  style inline, atau `setAttribute('style')` di seluruh `src/`; uji runtime ketiga renderer + Studio.
- Konformans: halaman `conformance/csp.html` (CSP ketat + Trusted Types) dan `csp.spec.ts`; Firefox ditambahkan
  (`CONFORMANCE_PAIR=chromium,firefox`). CI menjalankan keduanya.

### Ditambahkan — HLD Target F5 (Studio untuk review)
- `StudioOptions`/`<SduiBuilder>`: **`readOnly`** (peran reviewer), **`onSubmitForReview(payload, note)`**,
  **`baseline`** (payload release aktif → panel perubahan langsung), **`catalog`** (`screens`, `requests`, `links`,
  `commands`, `assets` — aset ditawarkan di `image.name`). `readOnly`, `baseline`, `catalog` bisa diubah via `update()`.
- `diff(base, next)` di `./builder`: perubahan per node (`#id` atau `parent/type[n]`) — prop, aksi, tipe, tambah/hapus,
  pindah — dan level screen (`key`, `load`, `variants`).

### Diubah — kemasan (HLD Target §1.3 / §3.2)
- `exports`: kondisi `import`/`require` bersarang dengan deklarasi masing-masing — `.d.ts` (ESM, specifier `.js`) dan
  `.d.cts` (CJS, specifier `.cjs`) dari `scripts/dts-formats.mjs`. Sebelumnya konsumen CJS mendapat tipe ESM.
- `npm run check:package`: tarball hasil `npm pack` di-typecheck sebagai konsumen `.cts` dan `.mts` (node16,
  `skipLibCheck` mati); CI juga menjalankan `publint --strict` (bersih).
- `repository.url` dalam format `git+https`.

### Diubah
- Schema: `screen.load` `maxItems` 16 → 8, sama dengan klien (penyempitan; klien sudah menolak > 8).
- `tests/bounds.test.ts`: untuk setiap angka di `spec/bounds.json`, payload tepat di batas (diterima) dan satu di atasnya
  (ditolak klien; ditolak schema bila schema bisa menyatakannya) dibangkitkan saat tes, tidak di-commit sebagai fixture,
  agar `spec/` yang terbit tetap kecil. Bound baru tanpa generator membuat tes gagal.
- Contoh README dan `HOST-BRIDGE.md` memakai `specScreenProvider`/`specManifestLoader` dan `keyedVerifier` dengan
  `keyId` seperti yang dikirim backend.

### Deprecated
- `universalScreenProvider` (kanal halaman A1) → `specScreenProvider`. Dihapus satu minor setelah aplikasi produksi berpindah.

### Tidak diadopsi dari 0.3.0 (bertentangan dengan arsitektur)
- Editor CSS bebas (style `spec/` tertutup), komponen `Modal`/`Toast` (menjadi aksi), isian URL mentah
  (`href`, `api.url`), dan penyuntingan `parentId`/`order` daftar datar (`spec/` berbentuk pohon).

## [0.6.1] — 2026-11-11

Menutup catatan lanjutan review 0.5.0.

### Diperbaiki
- **#1 Id tanpa `crypto.randomUUID()`.** Sumber id default kini `randomId()`: `crypto.randomUUID()` →
  UUID v4 dari `crypto.getRandomValues` (WebView lama / bukan secure context) → id waktu + penghitung bila Web Crypto
  tidak ada sama sekali. `handle()` tidak lagi bisa melempar di sini, jadi tombol tidak lagi diam tanpa pesan.
  Gerbang kemurnian core mengizinkan `getRandomValues` (sumber acak, bukan I/O); `crypto.subtle` tetap port.
- **#5 Form yang baru sukses dikirim dihitung bersih**, jadi pembaruan layout yang tertunda langsung diterapkan
  setelah submit sukses tanpa navigasi.

### Dokumentasi
- `HOST-BRIDGE.md`: origin lokal wajib secure context (cek `window.isSecureContext`, terutama skema kustom iOS);
  id transaksi dari backend lewat `screen.load` untuk transfer (#4); kapan host memanggil `applyPendingUpdate()` (#5).

## [0.6.0] — 2026-11-11

Menutup temuan review 0.5.0. Tes regresi: `tests/review-0.5.test.ts`.

### Diubah
- **#4 (BREAKING import)** `MESSAGES_ID` pindah ke entry baru **`@fajekrina/sdui/i18n`** (core hanya membawa
  `MESSAGES_EN`). Budget core dinaikkan **sadar** 18 → 20 KB (`scripts/size.mjs` mencatat alasannya); kenaikan
  berikutnya wajib dicatat di sini. Ukuran sekarang 18,1 KB.

### Diperbaiki
- **#1 Idempotency per pengiriman.** Satu kunci per *submission*: tap ulang setelah gagal/timeout dengan nilai form
  yang sama memakai kunci yang sama; nilai form berubah atau rantai sukses → kunci baru. Sumber id `crypto.randomUUID()`
  (bisa diganti lewat `createEngine({ newId })`); `Math.random` tidak dipakai lagi.
- **#2 Pembaruan SWR tidak mengganti layar di tengah interaksi.** Bila form kotor atau aksi berjalan, layout baru
  ditunda (`screen.hasPendingUpdate`, event `screen_update_deferred`) dan diterapkan saat idle atau lewat
  `screen.applyPendingUpdate()`; `screen.load` dijalankan ulang bila daftarnya berubah.
- **#3 Kunci tap ganda ditahan 1 dtk setelah `navigate`** (navigasi fire-and-forget), jadi tap kedua yang cepat
  tidak membuka layar dua kali.
- **#6** `HOST-BRIDGE.md`: checklist konfigurasi wajib sejak 0.5.0 (`PayloadSecurity.signed`, `MESSAGES_ID`,
  `assetURL` ke CDN, navigasi ganda, `Idempotency-Key` per pengiriman) dan contoh konfigurasi lengkap.

## [0.5.0] — 2026-11-11 · BREAKING (default keamanan)

Menutup temuan review 0.4.0 (1–10). Setiap temuan punya tes regresi di `tests/review-0.4.test.ts`.

### Diubah
- **#4 Default keamanan fail-closed.** `createEngine()` tanpa `security` kini **menolak semua payload** (release) dan
  menulis `logger.error`; dengan `debug: true` menerima payload tak bertanda tangan dengan peringatan keras. Untuk
  development tulis `PayloadSecurity.insecureDevelopment` secara eksplisit.
- **#7** `secure: true` tidak lagi memaksa keyboard numerik; jenis keyboard hanya dari `keyboard`
  (fixture `transfer_form`: PIN kini `keyboard: "number"`).

### Diperbaiki
- **#1 Layout basi tanpa manifest.** Bila cache aktif tetapi versi layar belum diketahui, layar dari cache disajikan
  *stale-while-revalidate*: tampil seketika, diambil ulang di belakang (`engine.settled()`), versi baru menggantikan
  layar yang sedang tampil lewat `onUpdate`, event `screen_revalidated`. Hit memori direvalidasi paling sering 30 dtk.
- **#2 Anti-rollback setelah restart.** Manifest yang diterapkan disimpan (tersegel cipher) di `CacheStore` dan
  diterapkan ulang (diverifikasi ulang) saat engine mulai; manifest lama setelah restart ditolak.
- **#3 Tap ganda.** `screen.handle` mengunci handler (dan form-nya) selama rantai aksi berjalan; tombol dirender
  `disabled` + `aria-busy`. Setiap tap membawa **idempotency key** (per request) → header `Idempotency-Key` untuk
  metode tulis di `fetchNetworkClient`.
- **#5 Path endpoint.** `{param}` kosong/hilang, `.`, atau `..` menggagalkan request sebelum dikirim.
- **#6 URL gambar.** `assetURL` bawaan (`relativeAssetURL`) menolak URL absolut, `//host`, `data:`, dan `..`;
  petakan nama ke CDN lewat `assetURL`.
- **#8** `auth.token` paralel di-dedupe (satu permintaan in-flight).
- **#9** Penerima iOS `window.sduiBridge` dibekukan dan tak bisa diganti; event host di-allow-list
  (`host.back`, `host.theme`, `host.viewport`); balasan harus cocok dengan id yang sedang ditunggu.
- **#10** Pesan validasi bisa dilokalkan: `createEngine({ messages })`; tersedia `MESSAGES_EN`, `MESSAGES_ID`.
- **#11** `DESAIN-ARSITEKTUR-SDUI.docx` dikeluarkan dari repo (`*.docx` di `.gitignore`).
- **Conformance Chromium ≡ WebKit (CI):** kontrol form kini punya metrik eksplisit (tinggi, line-height,
  `appearance: none`, panah `<select>` sendiri; tinggi `textArea` dari `rows`), karena ukuran bawaan
  select/textarea berbeda antar-engine. Harness memetakan aset ke PNG sungguhan (gambar 404 dirender beda per
  engine) dan menyamakan ejaan nilai terhitung yang setara (`flow-start` ≡ `flex-start`).

## [0.4.0] — 2026-11-11 · BREAKING

Eksekusi **"Usulan Arsitektur SDUI: Selaras dengan Murti"**: satu spec, satu engine, tiga host.
Format payload berganti total; data lama dikonversi (`fromUniversal`) atau dikeluarkan backend dalam format baru.

### Ditambahkan
- **Spec milik sendiri** di `spec/`: `sdui.schema.json` (Draft 2020-12, turunan murti v1 + v1.1 aditif),
  fixture `valid/` (murti + `transfer_form`, `home_load`) dan `invalid/` (murti + 6 baru), `spec/README.md`.
  Atribusi Apache-2.0 di `NOTICE`.
- **Engine berstruktur MurtiEngine** (`createEngine`): `componentFactory`, `screenFactory`, `actionDispatcher`,
  `validator`, `security`, `cache` di-inject; `load` / `screen(...)` / `prefetch` / `refreshManifest`; tidak pernah throw.
- `ScreenController`: load → `screen.load` paralel → render RenderNode → `handle` / `setFieldValue`; varian per lebar.
- **Model murti**: `SduiNode`, `SduiValue`, `ActionSpec`, `SduiPayload`/`SduiEnvelope` (base64 + `keyId`),
  `SduiBounds` (+ `maxLoadRequests` 8), `SchemaValidator`, `DataContext` + `{{token}}`, `resolveValue`.
- **Komponen** v1 (`text image vstack hstack zstack button card`) + v1.1 (`spacer divider grid scroll list form
  textField textArea picker`); style tertutup + **token warna semantik** (`--sdui-color-*`); simbol `systemName`.
- **Aksi** v1 (`navigate api dismiss refresh openURL`) + v1.1 (`toast`, `native`, `presentation` push/sheet/fullScreen);
  params mendukung token (token tunggal mempertahankan tipe).
- **Form**: scope `form.*`, validasi deklaratif, **pola bernama** (`numeric alphanumeric email phoneId amount pin6 nik`),
  `secure: true` (tidak pernah di-log/di-cache, tidak bocor ke data layar).
- **Cache** tiga tier (memori LRU → persisten → jaringan) per `screenKey@version`, verifikasi ulang tiap baca,
  last-good saat offline (hanya kegagalan transport), **manifest bertanda tangan dengan `sequence` anti-rollback**.
- **Port** (`NetworkClient`, `Navigator`, `HostPort`, `SignatureVerifier` + `keyedVerifier`, `CacheStore`, `CacheCipher`,
  `ViewportPort`, `Logger`). `./browser`: `fetchNetworkClient` (endpoint bernama di bundle, header async),
  `universalScreenProvider`, `webCryptoEd25519`, `indexedDbStore`, `aesGcmCipher`, `browserNavigator`, `windowViewport`.
- **`./bridge`**: protokol pesan web↔host (Android `addWebMessageListener`, iOS `WKScriptMessageHandler`),
  `nativeBridgePorts()` (navigasi, aksi `native`, token pola B, viewport, event analytics), `applyTheme`,
  `verifyBundleManifest` + `scripts/sign-bundle.mjs`.
- **Observabilitas** `onEvent`: `screen_loaded`, `validation_failed`, `unknown_component`, `action_dispatched`,
  `load_request`, `form_invalid`, `rollback_rejected`, `bridge_error`.
- **Renderer** generik `<SduiScreen>` (React, Vue) dan `mount()` (vanilla) + slot untuk komponen khusus toolkit.
- **Builder**: `EditorDocument` (pohon spec, undo/redo, impor legacy), **DSL TS** (`screen/vstack/text/button/navigate…`),
  `DSLExport` lossless, Studio DOM tunggal (React/Vue hanya wrapper) dengan panel JSON collapsible + sorot node.
- `./compat` `fromUniversal()`: konversi halaman Universal lama + peringatan per node (alat builder, bukan jalur runtime).
- Gerbang: tes spec (Ajv) + kemurnian core + paritas React = Vue = vanilla, `npm run size` (budget), `npm run conformance`
  (Chromium ≡ WebKit via Playwright), CI `.github/workflows/ci.yml` dengan `npm ci`.

### Dihapus (diganti)
- Format `UniversalPageConfig` / 18 tipe PascalCase / CSS bebas / `<Fajrina>` / `FajrinaBuilder` / `createRuntime` /
  `loadPage` / `toErrorPage`. Padanannya: spec v1.1 / komponen spec / style tertutup / `<SduiScreen>` / `SduiBuilder` /
  `createEngine` / `engine.load` / `errorView`.

### Perbaikan dari review 0.3.0
- ReDoS: regex dari payload diganti pola bernama. URL mentah di aksi `api`: diganti nama request (endpoint di bundle).
- Header statis: `getHeaders({ refresh })` async + satu kali refresh pada 401. Anti-rollback: `sequence` manifest.
- `customEvent` yang memunculkan toast: dihapus (aksi tertutup). Lockfile diperbarui; `npm ci` diverifikasi.

## [0.3.0] — 2026-11-10

Eksekusi `DESAIN-ARSITEKTUR-SDUI.md` Fase 0–3 (core memegang perilaku + RenderNode + adapter ketiga + builder).

### Ditambahkan
- **Runtime headless** `createRuntime()` — `load` / `render` / `handle` / `dispatch` / `submit` / state UI + `subscribe`.
- **Ports** (`core/ports`): storage, network, crypto, navigation, events, logger; default aman SSR/test (memori, no-op).
- Entry **`@fajekrina/sdui/browser`** (`browserPorts()`: localStorage, fetch + `If-None-Match`, WebCrypto, window/document).
- Entry **`@fajekrina/sdui/vanilla`** (`mount(el, options)`), adapter ketiga.
- **Builder — panel JSON** (React & Vue): tombol collapse ▾/▸ untuk buka/tutup panel; komponen yang dipilih di canvas
  disorot di JSON (pita biru + badge `Tipe · id · baris a–b`, auto-scroll). Helper headless `findComponentJsonRange(text, id)`.
- **RenderNode + registry** (`core/view-model`, `core/registry`): elemen, atribut tersanitasi, style final, binding field, wiring event diputuskan sekali di core.
- **Dispatcher aksi** (`core/actions`): `resolveAction` (normalisasi alias legacy), `onAction` → efek default yang bisa dibatalkan `event.preventDefault()`, cek policy sebelum efek, aksi `api` dengan rantai `onSuccess/onError` (≤ `maxChainDepth` 4).
- **UI store**: toast, modal, nilai + error form (validasi `required/minLength/maxLength/email/pattern`), error tampil di bawah field.
- **Loader** (`core/loader`): ETag/304, last-good cache, verifikasi envelope per `keyId` (termasuk isi cache), `verify.required` fail-closed.
- `mergePolicy`: policy aplikasi = batas atas, policy payload hanya mempersempit.
- Props React/Vue baru: `source`, `ports`, `verify`, `runtime`, `bounds`, `onLoad` / `@load`.
- `browserNetwork` default base `/api/universal/v1` (backend universal-service kini berversi); pesan error loader dibaca dari `errorMessage` (kontrak error backend baru), fallback `error`.
- Builder: pratinjau komponen memakai view-model core (== client), mode **Preview** penuh, panel validasi (validator yang sama dengan client/backend), palette dari registry core atau `registry` konsumen.
- Tes: gerbang kemurnian core, paritas React = Vue = vanilla (4 fixture termasuk 3 halaman `merchant_demo`), runtime, loader, adapter, builder (115 tes).

### Diubah
- Adapter React/Vue ditulis ulang jadi renderer generik (tanpa `switch` 18 tipe, tanpa `window`/`document`); `Fajrina.vue` → `Fajrina.ts` (render function).
- Vue membungkus output dengan satu `<div>` (sama dengan React).
- `<form>` diberi `novalidate`: validasi field kini dijalankan core, bukan browser.
- `navigate` tidak lagi diam saja secara implisit: tetap no-op default, tapi sekarang lewat `ports.navigation.navigate` (sambungkan router Anda).
- Link dengan href tidak aman (`javascript:` dll.) atau host di luar allow-list → `href="#"`; `position: fixed` di luar Modal/Toast dibuang.
- `validateData`: policy eksplisit + policy payload digabung (`mergePolicy`), cek behavior per tipe komponen, aksi `api`, kedalaman rantai.
- `SduiBounds.maxChainDepth` (opsional, default 4); `UniversalBehavior` + `back | submit | api`.
- **Pemetaan error lebih rinci** (kompatibel ke belakang kecuali kode di bawah):
  - `SduiError` + `status?` (HTTP) dan `serverCode?` (mis. `errorCode: "SDUI-002"` dari universal-service).
  - Kode baru `http` = server menjawab non-2xx; `network` kini **hanya** kegagalan transport (offline, CORS, abort, tanpa NetworkPort).
    **Perhatian:** 4xx/5xx tanpa cache dulu `network`, sekarang `http`.
  - `toErrorPage(message, { kind, code, status, serverCode })`: judul mengikuti jenis — `Not Found` (404/410), `Access Denied` (401/403),
    `Request Rejected` (4xx lain), `Service Unavailable` (5xx), `Offline`, `Invalid Page` (decode/signature), `Blocked` (strict).
    Detail mesin di `page.error`. Tanpa opsi = output lama (`Not Found`). Helper `errorKindOf(err)`.

### Deprecated (dihapus di 1.0)
- `loadPageWithCache`, `fetchUniversalPage*`, `fetchSignedPage` → `createRuntime().load` / `loadPage` + `NetworkPort`.
- Bentuk aksi legacy: `props.action` string, `props.behavior`, `url`/`action.action` (peringatan sekali per runtime).

### Diketahui
- Ukuran chunk core ~12,9 KB gzip, di atas target 10 KB pada desain §9 (belum ada gate `size-limit`).

## [0.2.0] — 2026-11-09

### Ditambahkan
- Validasi warn-first: modul `core/validate` (kode error `decode/schema/unsupportedVersion/unknownType/unknownAction/unlistedDomain/unlistedEvent/bounds/network`, 8 angka bounds, identifier ASCII longgar-ULID, `schemaVersion` 1.x, target aksi wajib, allow-list domain/event per merchant opsional). `warnValidation()` hanya `console.warn` — tidak mengubah render.
- Fajrina React/Vue: prop `mode` (`warn` default | `strict` fail-closed ke halaman error), `policy`, `theme`.
- Tema project: `core/theme` (`resolveTokenRef`, `applyThemeToStyle`, `resolveThemeTokens`, tipe `UniversalTheme`) + prop `theme` di kedua adapter. Token tak dikenal jatuh ke preset (fail-soft).
- Error page bersama `toErrorPage` di core; kedua demo memakainya (hapus duplikasi).
- Last-good cache `core/cache` (`loadPageWithCache`, key `fajrina-page:{mid}:{key}`); kedua demo memakainya saat fetch gagal.
- Tipe props per komponen (`core/props`, `ComponentPropsMap`, `PropsFor<T>`).
- Envelope bertanda tangan: tipe `SignedEnvelope`, `verifyEnvelope` (Ed25519 WebCrypto), `signBytes` + `encodeEnvelopeParts` untuk tooling/test. Backend: endpoint `?signed=true` + `/signing-key`, default nonaktif.
- Fixture `fixtures/valid/showcase-18.json` + 4 invalid; test suite vitest (core: tree/style/validate/theme/cache/sign; React: strict, Null-Object, no-alert, theme).

### Diubah
- Null-Object menggantikan kotak kuning "Unsupported type": tipe asing me-render nothing (marker garis putus-putus hanya di development).
- Validasi form gagal tidak lagi `alert()`: mengirim `validationError` via `onAction`/`@validationError`; demo mengabaikannya (tanpa panggilan server).
- Vue: hapus shim `declare module '@fajekrina/sdui*'` di `env.d.ts`; tipe library dipakai langsung. Alias tipe lokal di service/repository diganti tipe library.

### Backend yang disesuaikan (universal-service, repo terpisah)
- `schemaVersion: "1.0"` di semua halaman + model; format 1.x divalidasi saat save.
- Policy per merchant: file `data/universal/policies/{merchantId}.json`, endpoint GET/PUT `/api/universal/merchant/policies/{mid}`, dilampirkan otomatis di semua respons halaman.
- Save menegakkan: bounds (depth/nodes/string/props/children/array/identifier), Grid/Flex, navigate/modalId wajib, externalLink/customEvent melawan policy merchant bila ada.
- Aksi form checkout diperbaiki: string legacy `/api/payment` → `{behavior: "submit", params: {target: "home"}}`.
- Signing endpoint opsional (default nonaktif, butuh file kunci via konfigurasi).

## [0.1.0] — 2026-11-03
- Rilis awal: renderer agnostik React/Vue/Vanilla untuk Universal SDUI JSON (18 tipe), builder headless + UI React/Vue, tanpa Tailwind/Bootstrap, inline CSS via `buildLayoutStyle`.
- Tipe `UniversalComponentType` dilengkapi: Card, Flex, Grid, Hero, Space.
