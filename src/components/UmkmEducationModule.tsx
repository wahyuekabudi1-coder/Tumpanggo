/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Modul Edukasi & Strategi Digitalisasi UMKM TumpangGo
 * Konten artikel edukatif komprehensif untuk pengusaha lokal, UMKM, dan generasi milenial.
 * Dilengkapi semantic markup (H1, H2, H3), breadcrumb, dan Schema.org JSON-LD (Article).
 */

import React, { useState } from 'react';
import { 
  BookOpen, 
  Sparkles, 
  TrendingUp, 
  Smartphone, 
  Store, 
  ShieldCheck, 
  Users, 
  Clock, 
  ChevronRight, 
  ArrowLeft, 
  CheckCircle2, 
  Share2, 
  Tag, 
  Search,
  Lightbulb
} from 'lucide-react';

export interface ArticleData {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: 'Digitalisasi' | 'Marketing' | 'Kuliner' | 'Milenial' | 'Finansial';
  readTime: string;
  publishedDate: string;
  author: string;
  sections: {
    heading: string;
    paragraphs: string[];
    tips?: string[];
  }[];
  keyTakeaways: string[];
}

export const UMKM_ARTICLES: ArticleData[] = [
  {
    id: 'artikel-1',
    slug: 'cara-membawa-usaha-lokal-naik-kelas-era-digital',
    title: 'Cara Membawa Usaha Lokal Naik Kelas di Era Digital',
    summary: 'Langkah praktis bagi pemilik warung dan usaha kuliner di Kecamatan Tumpang untuk bertransformasi dari jualan konvensional menuju ekosistem digital yang efisien dan menguntungkan.',
    category: 'Digitalisasi',
    readTime: '4 menit baca',
    publishedDate: '18 Oktober 2026',
    author: 'Tim Kurasi TumpangGo',
    sections: [
      {
        heading: '1. Memahami Perubahan Kebiasaan Konsumen Lokal',
        paragraphs: [
          'Saat ini, masyarakat di sekitar kita semakin terbiasa mencari informasi makanan, jam buka, dan memesan kebutuhan langsung melalui gawai mereka. Konsumen menyukai kepraktisan tanpa harus keluar rumah di saat cuaca hujan atau kesibukan kerja.',
          'Bagi pelaku usaha mikro, kecil, dan menengah (UMKM) di Tumpang, kehadiran digital bukan lagi sekadar pelengkap, melainkan jembatan penting untuk mempertahankan loyalitas pembeli lama sekaligus menjaring pembeli baru di sekitar lingkungan.'
        ],
        tips: [
          'Pastikan nomor WhatsApp usaha selalu aktif dan mudah dihubungi.',
          'Pasang nama usaha dan jam operasional yang jelas di media sosial atau platform lokal.'
        ]
      },
      {
        heading: '2. Foto Produk yang Jelas dan Informasi Menu Transparan',
        paragraphs: [
          'Dalam dunia online, pembeli "makan dengan mata" terlebih dahulu. Anda tidak perlu kamera mahal; cukup gunakan smartphone di dekat pencahayaan alami (seperti dekat jendela atau pintu warung saat pagi/siang).',
          'Sertakan nama menu yang deskriptif beserta harganya secara jujur. Ketidakpastian harga sering kali menjadi alasan utama calon pelanggan ragu untuk memesan.'
        ]
      },
      {
        heading: '3. Memanfaatkan Pengantaran Lokal yang Cepat dan Hemat',
        paragraphs: [
          'Salah satu kendala terbesar pelanggan memesan makanan lokal adalah biaya ongkir yang terlalu mahal dibandingkan harga makanannya. Dengan memanfaatkan platform lokal TumpangGo yang menerapkan tarif flat Rp 5.000 se-Kecamatan Tumpang, pembeli merasa nyaman bertransaksi secara rutin tanpa terbebani ongkos kirim.',
          'Pelaku usaha dapat memfokuskan energi pada kualitas masakan dan kecepatan penyiapan pesanan, sementara urusan antar diserahkan pada kurir lokal terpercaya.'
        ]
      }
    ],
    keyTakeaways: [
      'Konsumen lokal menyukai kemudahan pemesanan dari smartphone.',
      'Foto makanan yang bersih dan harga transparan meningkatkan keyakinan pembeli.',
      'Ongkir hemat flat Rp 5.000 membuat pelanggan lebih sering memesan ulang.'
    ]
  },
  {
    id: 'artikel-2',
    slug: 'strategi-digital-marketing-umkm-pemula',
    title: 'Strategi Digital Marketing untuk UMKM Pemula',
    summary: 'Panduan pemasaran online hemat biaya tanpa perlu bakar modal iklan besar, memanfaatkan komunitas lokal dan media sosial sekitar wilayah Malang.',
    category: 'Marketing',
    readTime: '5 menit baca',
    publishedDate: '15 Oktober 2026',
    author: 'Tim Edukasi UMKM',
    sections: [
      {
        heading: '1. Kekuatan Pemasaran dari Mulut ke Mulut Versi Digital',
        paragraphs: [
          'Pemasaran paling efektif bagi usaha di level kecamatan adalah rekomendasi tetangga dan kerabat. Anda bisa mendorong pembeli yang puas untuk membagikan foto makanan mereka di status WhatsApp atau Instagram Stories.',
          'Berikan sentuhan ramah pada kemasan, seperti ucapan terima kasih tulisan tangan sederhana atau stiker kecil dengan nama usaha Anda.'
        ]
      },
      {
        heading: '2. Konsistensi Konten Cerita di Balik Dapur',
        paragraphs: [
          'Orang menyukai keaslian. Tampilkan proses pembuatan sambal segar, pemilihan bahan baku di pasar lokal pagi hari, atau kebersihan dapur Anda. Konten pendek yang jujur dan tulus justru mendapatkan interaksi lebih hangat dibandingkan iklan kaku.',
          'Luangkan waktu 5 menit setiap hari untuk memperbarui status tentang menu spesial hari ini atau stok yang masih tersedia.'
        ]
      },
      {
        heading: '3. Penawaran Paket Hemat dan Bundling Menu',
        paragraphs: [
          'Tingkatkan nilai pesanan rata-rata (average order value) dengan membuat paket praktis, misalnya paket "Nasi Bebek + Es Jeruk Segar" dengan harga sedikit lebih hemat dibanding beli terpisah.',
          'Paket hemat sangat diminati oleh pekerja kantor, anak kos, dan keluarga yang mencari santapan makan siang praktis.'
        ]
      }
    ],
    keyTakeaways: [
      'Manfaatkan Status WhatsApp dan grup lingkungan sekitar untuk promosi harian.',
      'Bagikan kisah nyata di balik dapur untuk membangun kedekatan emosional.',
      'Buat paket bundling makanan + minuman untuk meningkatkan total omzet.'
    ]
  },
  {
    id: 'artikel-3',
    slug: 'cara-menarik-pelanggan-baru-usaha-kuliner',
    title: 'Cara Menarik Pelanggan Baru untuk Usaha Kuliner',
    summary: 'Kunci mempertahankan pelanggan baru melalui kebersihan kemasan, kecepatan respons, dan cita rasa yang konsisten.',
    category: 'Kuliner',
    readTime: '3 menit baca',
    publishedDate: '12 Oktober 2026',
    author: 'Konsultan Kuliner Lokal',
    sections: [
      {
        heading: '1. Kemasan Rapi dan Aman di Perjalanan',
        paragraphs: [
          'Makanan yang lezat bisa kehilangan selera jika kuah tumpah atau kemasan basah saat sampai di tangan pembeli. Gunakan wadah bersegel baik, pisahkan kuah atau sambal dalam plastik terpisah, dan pastikan kantong terikat rapi.',
          'Kemasan yang bersih mencerminkan standar higienitas dapur Anda dan membangun kepercayaan sejak kesan pertama.'
        ]
      },
      {
        heading: '2. Konsistensi Rasa adalah Kunci Langganan',
        paragraphs: [
          'Pelanggan kembali karena rasa yang sama seperti saat pertama kali mereka mencoba. Buat takaran bumbu dasar yang baku agar rasa masakan tidak berubah-ubah bergantung pada siapa yang memasak.',
          'Catat masukan pelanggan dengan lapang dada untuk memperbaiki kualitas hidangan secara berkelanjutan.'
        ]
      }
    ],
    keyTakeaways: [
      'Gunakan wadah kedap dan pisahkan kuah agar makanan tetap nikmat saat tiba.',
      'Terapkan takaran bumbu standar untuk menjaga konsistensi cita rasa.',
      'Pelayanan yang cepat dan ramah menjadikan pembeli pertama sebagai pelanggan setia.'
    ]
  },
  {
    id: 'artikel-4',
    slug: 'pentingnya-digitalisasi-bagi-pengusaha-milenial',
    title: 'Pentingnya Digitalisasi bagi Pengusaha Milenial',
    summary: 'Bagaimana generasi muda di Tumpang dapat memanfaatkan teknologi untuk merintis usaha mandiri tanpa beban sewa tempat mahal di jalan raya.',
    category: 'Milenial',
    readTime: '4 menit baca',
    publishedDate: '10 Oktober 2026',
    author: 'Komunitas Pengusaha Muda Malang',
    sections: [
      {
        heading: '1. Modal Kecil, Jangkauan Luas Melalui Cloud Kitchen Rumahan',
        paragraphs: [
          'Dahulu, membuka usaha kuliner membutuhkan biaya sewa ruko puluhan juta rupiah di pinggir jalan raya. Kini, pengusaha muda milenial dapat memulai dapur dari rumah atau gang kampung dengan mendaftarkan menu di platform digital TumpangGo.',
          'Modal usaha dapat dialihkan untuk riset rasa, kemasan berkualitas, dan bahan baku premium.'
        ]
      },
      {
        heading: '2. Kecepatan Adaptasi Tren dan Branding Unik',
        paragraphs: [
          'Generasi muda memiliki kepekaan tinggi terhadap tren kekinian, mulai dari kopi racikan lokal, camilan pedas, hingga kuliner fusion. Gabungkan kreativitas tersebut dengan kearifan lokal Tumpang untuk menciptakan produk yang berkarakter.',
          'Teknologi memungkinkan pengusaha muda menguji menu baru secara cepat melalui menu musiman online.'
        ]
      }
    ],
    keyTakeaways: [
      'Usaha kuliner modern bisa dimulai dari rumah dengan sistem pesan-antar online.',
      'Penghematan biaya sewa ruko dapat dialokasikan untuk kualitas bahan dan kemasan.',
      'Fleksibilitas digital memudahkan pengusaha muda mencoba berbagai ide inovatif.'
    ]
  },
  {
    id: 'artikel-5',
    slug: 'cara-membangun-kepercayaan-pelanggan-online',
    title: 'Cara Membangun Kepercayaan Pelanggan secara Online',
    summary: 'Kiat menjaga reputasi toko online, transparansi pembayaran dengan QRIS resmi, dan penanganan pesanan secara profesional.',
    category: 'Finansial',
    readTime: '3 menit baca',
    publishedDate: '08 Oktober 2026',
    author: 'Tim Finansial & Keamanan',
    sections: [
      {
        heading: '1. Pembayaran Non-Tunai QRIS yang Aman dan Instan',
        paragraphs: [
          'Era menghitung uang kembalian receh yang basah atau lecek di warung kini digantikan oleh QRIS. Dengan menyediakan opsi QRIS ArtoPay di TumpangGo, pelanggan cukup scan menggunakan aplikasi mobile banking atau e-wallet apa pun.',
          'Transaksi langsung tercatat otomatis, meminimalkan selisih kas harian dan memberikan rasa aman bagi kedua belah pihak.'
        ]
      },
      {
        heading: '2. Kejujuran Ketersediaan Stok',
        paragraphs: [
          'Jika menu favorit Anda habis, segera ubah status menu di portal merchant menjadi tidak aktif. Mengonfirmasi pesanan yang stoknya habis setelah pembeli menunggu lama adalah salah satu penyebab utama kekecewaan pelanggan.',
          'Komunikasi terbuka dan santun selalu diapresiasi oleh pembeli lokal.'
        ]
      }
    ],
    keyTakeaways: [
      'QRIS otomatis membuat transaksi lebih cepat, higienis, dan tercatat rapi.',
      'Perbarui ketersediaan stok menu agar pembeli tidak menunggu pesanan kosong.',
      'Reputasi baik dibangun dari keterbukaan informasi dan pelayanan jujur.'
    ]
  },
  {
    id: 'artikel-6',
    slug: 'strategi-mengembangkan-bisnis-lingkungan-sekitar',
    title: 'Strategi Mengembangkan Bisnis dari Lingkungan Sekitar',
    summary: 'Konsep hyperlocal commerce: menguasai pasar warga kecamatan Tumpang sebelum berekspansi ke pasar yang lebih luas.',
    category: 'Marketing',
    readTime: '4 menit baca',
    publishedDate: '05 Oktober 2026',
    author: 'Tim Inkubasi Bisnis',
    sections: [
      {
        heading: '1. Kedekatan Emosional dengan Pelanggan Sekitar',
        paragraphs: [
          'Pasar terbaik untuk memulai usaha adalah orang-orang yang berada dalam radius 1 hingga 5 kilometer dari lokasi Anda. Mereka adalah tetangga, kenalan sekolah, komunitas pengajian, atau rekan kerja yang dapat memberikan umpan balik langsung.',
          'Membangun basis 100 pelanggan setia di sekitar Tumpang memberikan arus kas stabil yang sangat menopang kelangsungan usaha jangka panjang.'
        ]
      },
      {
        heading: '2. Berkolaborasi, Bukan Saling Menjatuhkan',
        paragraphs: [
          'Ekosistem TumpangGo mendorong kerja sama antar sesama pelaku usaha lokal. Warung makan dapat berkolaborasi dengan produsen keripik rumahan atau penjual minuman lokal untuk saling menitipkan produk.',
          'Ketika usaha lokal saling menguatkan, perputaran ekonomi di Kecamatan Tumpang akan semakin mandiri dan menyejahterakan warga.'
        ]
      }
    ],
    keyTakeaways: [
      'Pasar terdekat adalah pondasi paling kokoh sebelum memperluas skala bisnis.',
      'Basis pelanggan setia lokal menghasilkan pendapatan stabil dan berkelanjutan.',
      'Kolaborasi antar pelaku UMKM memperkuat daya tahan ekonomi daerah.'
    ]
  },
  {
    id: 'artikel-7',
    slug: 'panduan-memanfaatkan-teknologi-mengembangkan-usaha',
    title: 'Panduan Memanfaatkan Teknologi untuk Mengembangkan Usaha',
    summary: 'Bagaimana integrasi fitur TumpangGo membantu pemilik usaha mengelola pesanan, pencatatan pendapatan, dan pengantaran kurir secara otomatis.',
    category: 'Digitalisasi',
    readTime: '4 menit baca',
    publishedDate: '01 Oktober 2026',
    author: 'Tim Teknologi TumpangGo',
    sections: [
      {
        heading: '1. Manajemen Pesanan Terpusat',
        paragraphs: [
          'Dengan sistem portal merchant TumpangGo, notifikasi pesanan masuk berbunyi seketika di ponsel Anda. Anda dapat menerima pesanan, menandai makanan sedang dimasak, hingga siap diambil kurir hanya dengan sekali sentuh.',
          'Tidak ada lagi pesanan terlewat atau terselip di obrolan chat pribadi yang menumpuk.'
        ]
      },
      {
        heading: '2. Laporan Penjualan Otomatis Tanpa Buku Manual',
        paragraphs: [
          'Semua riwayat transaksi pesanan, total omzet harian, dan ringkasan menu terlaris tersimpan rapi di dashboard merchant. Anda dapat melihat waktu-waktu ramai belanja sehingga bisa menyiapkan bahan baku lebih efisien.',
          'Saatnya beralih dari pencatatan manual yang rentan hilang menuju kemudahan digital yang akurat.'
        ]
      }
    ],
    keyTakeaways: [
      'Notifikasi pesanan instan mencegah pesanan pelanggan terlewat.',
      'Riwayat transaksi dan omzet harian otomatis memudahkan perencanaan stok.',
      'Sistem terintegrasi meringankan beban operasional pemilik usaha.'
    ]
  }
];

interface UmkmEducationModuleProps {
  onBackToHome: () => void;
  onOpenPartnerRegister: () => void;
  onExploreFood: () => void;
  initialArticleSlug?: string;
}

export default function UmkmEducationModule({
  onBackToHome,
  onOpenPartnerRegister,
  onExploreFood,
  initialArticleSlug
}: UmkmEducationModuleProps) {
  const [selectedArticle, setSelectedArticle] = useState<ArticleData | null>(() => {
    if (initialArticleSlug) {
      return UMKM_ARTICLES.find(a => a.slug === initialArticleSlug) || null;
    }
    return null;
  });

  const [activeCategory, setActiveCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = ['Semua', 'Digitalisasi', 'Marketing', 'Kuliner', 'Milenial', 'Finansial'];

  const filteredArticles = UMKM_ARTICLES.filter(article => {
    const matchesCategory = activeCategory === 'Semua' || article.category === activeCategory;
    const matchesSearch = searchQuery.trim() === '' || 
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Handle article view selection
  const handleSelectArticle = (article: ArticleData) => {
    setSelectedArticle(article);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Structured data for current article if viewing detail
  const articleSchema = selectedArticle ? {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": selectedArticle.title,
    "description": selectedArticle.summary,
    "author": {
      "@type": "Organization",
      "name": selectedArticle.author
    },
    "publisher": {
      "@type": "Organization",
      "name": "TumpangGo",
      "logo": {
        "@type": "ImageObject",
        "url": "https://tumpanggo.com/logo44.png"
      }
    },
    "datePublished": "2026-10-18",
    "mainEntityOfPage": `https://tumpanggo.com/?page=edukasi&slug=${selectedArticle.slug}`
  } : null;

  return (
    <div className="flex flex-col gap-5 pb-8 font-sans">
      {/* Dynamic Schema Injection for SEO Rich Snippet */}
      {articleSchema && (
        <script 
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
        />
      )}

      {/* Breadcrumb Navigation for SEO & User Experience */}
      <nav aria-label="Breadcrumb" className="bg-white/80 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-slate-100 shadow-2xs text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
        <button 
          onClick={onBackToHome}
          className="text-emerald-800 hover:underline font-semibold cursor-pointer"
        >
          Beranda
        </button>
        <span className="text-slate-300">/</span>
        <button 
          onClick={() => setSelectedArticle(null)}
          className={`font-semibold cursor-pointer ${!selectedArticle ? 'text-slate-800 font-bold' : 'text-emerald-800 hover:underline'}`}
        >
          Edukasi &amp; Panduan UMKM
        </button>
        {selectedArticle && (
          <>
            <span className="text-slate-300">/</span>
            <span className="text-slate-800 font-medium truncate max-w-[170px]" title={selectedArticle.title}>
              {selectedArticle.title}
            </span>
          </>
        )}
      </nav>

      {/* DETAIL ARTICLE VIEW */}
      {selectedArticle ? (
        <article className="bg-white rounded-3xl border border-slate-100 p-5 sm:p-6 shadow-sm flex flex-col gap-5">
          {/* Back button */}
          <button
            onClick={() => setSelectedArticle(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-emerald-800 self-start py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Daftar Panduan</span>
          </button>

          {/* Article Header */}
          <header className="flex flex-col gap-2.5 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-tight">
                {selectedArticle.category}
              </span>
              <span className="text-slate-400 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" /> {selectedArticle.readTime}
              </span>
              <span className="text-slate-400 text-xs">• {selectedArticle.publishedDate}</span>
            </div>

            <h1 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 leading-snug">
              {selectedArticle.title}
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-100/60">
              {selectedArticle.summary}
            </p>
          </header>

          {/* Key Takeaways Box */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
              <Lightbulb className="w-4 h-4 text-amber-600" />
              <span>Poin Penting untuk Pelaku Usaha:</span>
            </div>
            <ul className="space-y-1.5 pl-1">
              {selectedArticle.keyTakeaways.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[11px] sm:text-xs text-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Article Sections (H2 & Paragraphs) */}
          <div className="flex flex-col gap-5 text-slate-700 text-xs sm:text-sm leading-relaxed">
            {selectedArticle.sections.map((sec, sIdx) => (
              <section key={sIdx} className="flex flex-col gap-2.5">
                <h2 className="font-display font-extrabold text-sm sm:text-base text-slate-900 leading-snug pt-1">
                  {sec.heading}
                </h2>
                {sec.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="text-slate-600 leading-relaxed">
                    {p}
                  </p>
                ))}
                {sec.tips && sec.tips.length > 0 && (
                  <div className="bg-slate-50 border-l-3 border-emerald-600 p-3 rounded-r-xl mt-1 space-y-1">
                    <p className="font-bold text-[11px] text-emerald-900 uppercase tracking-tight">Tips Praktis:</p>
                    {sec.tips.map((tip, tIdx) => (
                      <p key={tIdx} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                        <span className="text-emerald-700 font-bold">•</span>
                        <span>{tip}</span>
                      </p>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* Action CTA Box */}
          <div className="bg-[#185338] text-white rounded-2xl p-5 flex flex-col gap-3 mt-4 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/30 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white leading-tight">
                  Siap Membawa Usaha Anda Naik Kelas?
                </h3>
                <p className="text-[11px] text-emerald-100/90 mt-0.5">
                  Daftarkan usaha kuliner Anda di TumpangGo hari ini tanpa biaya pendaftaran.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-2">
              <button
                onClick={onOpenPartnerRegister}
                className="flex-1 bg-[#fbc043] hover:bg-[#f3b325] text-slate-950 font-extrabold text-xs py-2.5 px-4 rounded-xl transition-all shadow-sm text-center cursor-pointer active:scale-98"
              >
                Mulai Kembangkan Usaha
              </button>
              <button
                onClick={onExploreFood}
                className="bg-emerald-800/80 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all border border-emerald-600/40 text-center cursor-pointer active:scale-98"
              >
                Jelajahi Kuliner Lokal
              </button>
            </div>
          </div>
        </article>
      ) : (
        /* LIST ARTICLES VIEW */
        <div className="flex flex-col gap-4">
          {/* Header Banner */}
          <div className="bg-gradient-to-br from-[#185338] to-[#12422c] text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden">
            <div className="relative z-10 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-tight">
                  Edukasi &amp; Panduan
                </span>
                <span className="text-emerald-200 text-xs font-semibold">TumpangGo Academy</span>
              </div>
              <h1 className="font-display font-extrabold text-lg sm:text-xl text-white leading-tight">
                Strategi &amp; Panduan Digitalisasi UMKM Lokal
              </h1>
              <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed font-normal">
                Kumpulan wawasan praktis, tips pemasaran online, dan panduan teknologi untuk membantu pengusaha lokal dan generasi milenial Tumpang mengembangkan usahanya secara nyata.
              </p>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-col gap-2.5 bg-white p-3.5 rounded-2xl border border-slate-100 shadow-2xs">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari topik panduan (misal: digital marketing, kemasan, QRIS)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white transition-colors"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`text-[11px] font-extrabold px-3 py-1.5 rounded-xl shrink-0 transition-all cursor-pointer ${
                    activeCategory === cat
                      ? 'bg-emerald-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Article Cards Grid */}
          <div className="flex flex-col gap-3">
            {filteredArticles.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 text-slate-400 text-xs">
                Tidak ada artikel yang cocok dengan pencarian Anda. Silakan coba kata kunci lain.
              </div>
            ) : (
              filteredArticles.map((article, idx) => (
                <article
                  key={article.id}
                  onClick={() => handleSelectArticle(article)}
                  className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between gap-3 relative"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/50">
                        {article.category}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {article.readTime}
                      </span>
                    </div>

                    <h2 className="font-display font-extrabold text-sm sm:text-base text-slate-900 group-hover:text-emerald-800 transition-colors leading-snug pt-1">
                      {article.title}
                    </h2>

                    <p className="text-[11px] sm:text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {article.summary}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-[11px] text-emerald-800 font-bold">
                    <span>Baca Panduan Lengkap</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Bottom Partnership Banner */}
          <div className="bg-[#185338] text-white rounded-3xl p-5 shadow-sm flex flex-col gap-3 mt-2">
            <h3 className="font-display font-extrabold text-sm sm:text-base text-white">
              Saatnya Usaha Lokal Anda Naik Kelas Bersama TumpangGo
            </h3>
            <p className="text-xs text-emerald-100/90 leading-relaxed font-normal">
              Jangan biarkan jarak membatasi potensi penjualan Anda. Bergabung bersama puluhan merchant kuliner lokal lainnya di Tumpang dan nikmati kemudahan sistem pesanan online terintegrasi.
            </p>
            <button
              onClick={onOpenPartnerRegister}
              className="bg-[#fbc043] hover:bg-[#f3b325] text-slate-950 font-extrabold text-xs py-3 px-4 rounded-xl transition-all shadow-sm text-center cursor-pointer active:scale-98 mt-1"
            >
              Gabung sebagai Mitra Usaha Sekarang
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
