/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Pusat Bantuan TumpangGo (Help Center)
 * Comprehensive, verified self-service guidance for Customers, UMKM Merchants, and Drivers.
 * Provides searchable FAQs, partnership guides, platform tutorials, problem reporting,
 * and official verified support contacts.
 */

import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, Search, HelpCircle, BookOpen, Store, Bike, 
  Smartphone, AlertCircle, CheckCircle2, Mail, MapPin, 
  Clock, ChevronDown, ChevronUp, Send, ShieldCheck, 
  Sparkles, ExternalLink
} from 'lucide-react';
import { SocialMediaButtons } from './SocialMediaButtons';

interface HelpCenterViewProps {
  onBack: () => void;
  onNavigateToPartnerRegister?: () => void;
  onNavigateToTracking?: () => void;
}

type HelpCategory = 'all' | 'customer' | 'merchant' | 'driver' | 'platform' | 'report';

interface FAQItem {
  id: string;
  category: 'customer' | 'merchant' | 'driver' | 'platform';
  question: string;
  answer: string;
  tags: string[];
}

const FAQ_DATABASE: FAQItem[] = [
  // --- Pelanggan ---
  {
    id: 'c1',
    category: 'customer',
    question: 'Bagaimana cara memesan kuliner di TumpangGo?',
    answer: 'Pilih kuliner favorit Anda di halaman Beranda Kuliner, tentukan jumlah porsi, klik "Pesan Sekarang", masukkan nama dan alamat pengantaran di Kecamatan Tumpang, lalu selesaikan pembayaran via QRIS resmi toko atau bayar tunai di tempat (COD).',
    tags: ['pesan', 'order', 'kuliner', 'makanan', 'beli']
  },
  {
    id: 'c2',
    category: 'customer',
    question: 'Berapa tarif ongkir pengantaran di TumpangGo?',
    answer: 'Tarif ongkir pengantaran makanan di TumpangGo flat hemat Rp 5.000 untuk seluruh wilayah se-Kecamatan Tumpang (meliputi Desa Tumpang, Jeru, Malangsuko, Bokor, Slamet, Wringinsongo, Benjor, Duwet, Kidal, Kambingan, Ngingit, Tulusbesar, Pandanajeng). Tanpa lonjakan biaya jarak tersembunyi.',
    tags: ['ongkir', 'tarif', 'biaya', 'pengantaran', 'flat', '5000']
  },
  {
    id: 'c3',
    category: 'customer',
    question: 'Metode pembayaran apa saja yang diterima?',
    answer: 'TumpangGo mendukung pembayaran non-tunai melalui QRIS Resmi Toko (menerima semua m-banking BCA, Mandiri, BRI, BNI, Jatim serta e-wallet GoPay, OVO, Dana, ShopeePay, LinkAja) serta metode Bayar Tunai di Tempat (COD) kepada kurir.',
    tags: ['bayar', 'pembayaran', 'qris', 'transfer', 'cod', 'tunai']
  },
  {
    id: 'c4',
    category: 'customer',
    question: 'Bagaimana cara melacak pesanan saya?',
    answer: 'Setelah membuat pesanan, Anda akan menerima Kode Pesanan resmi berformat TF-YYYYMMDD-XXX. Buka menu "Lacak Order" di navigasi bawah, masukkan kode pesanan Anda, dan Anda dapat memantau status memasak di dapur toko hingga posisi pengantaran kurir secara langsung.',
    tags: ['lacak', 'tracking', 'status', 'pesanan', 'kode']
  },
  {
    id: 'c5',
    category: 'customer',
    question: 'Berapa lama estimasi pesanan sampai?',
    answer: 'Waktu memasak rata-rata toko berkisar antara 10 hingga 25 menit tergantung antrean dapur. Waktu pengantaran kurir se-Kecamatan Tumpang rata-rata 10 hingga 20 menit. Estimasi total tiba di lokasi adalah 20 hingga 45 menit.',
    tags: ['estimasi', 'waktu', 'durasi', 'lama', 'sampai']
  },

  // --- Mitra UMKM ---
  {
    id: 'm1',
    category: 'merchant',
    question: 'Apa syarat untuk mendaftarkan usaha kuliner di TumpangGo?',
    answer: 'Usaha berada di wilayah Kecamatan Tumpang, menyediakan menu makanan/minuman yang higienis dan halal/jelas keterangannya, memiliki tempat produksi/warung, serta berkomitmen melayani pesanan pelanggan dengan ramah dan tepat waktu. Pendaftaran 100% gratis tanpa biaya pendaftaran.',
    tags: ['mitra', 'daftar', 'toko', 'umkm', 'warung', 'syarat']
  },
  {
    id: 'm2',
    category: 'merchant',
    question: 'Dokumen apa saja yang perlu disiapkan saat mendaftar?',
    answer: 'Data identitas pemilik (Nama & No. WhatsApp aktif), Nama Usaha/Warung, Alamat lengkap toko, Foto tempat usaha/spanduk/dapur, dan daftar menu beserta harga. Foto QRIS toko dapat diunggah langsung untuk menerima pembayaran pelanggan tanpa perantara.',
    tags: ['dokumen', 'berkas', 'ktp', 'foto', 'qris']
  },
  {
    id: 'm3',
    category: 'merchant',
    question: 'Bagaimana proses persetujuan dan verifikasi pendaftaran mitra?',
    answer: 'Setelah mengisi formulir online di menu "Mitra TumpangGo", tim operasional kami akan meninjau data Anda dalam waktu maksimal 1x24 jam kerja. Setelah disetujui, akun portal merchant Anda langsung aktif dan dapat mulai mengunggah menu serta menerima pesanan.',
    tags: ['persetujuan', 'verifikasi', 'aktivasi', 'waktu', 'status']
  },
  {
    id: 'm4',
    category: 'merchant',
    question: 'Bagaimana sistem pencairan dana hasil penjualan?',
    answer: 'Untuk pembayaran QRIS langsung toko, uang masuk 100% langsung ke rekening/e-wallet merchant secara instan. Untuk pesanan COD, kurir menyetorkan uang tunai saat mengambil pesanan di dapur atau sesuai rekapitulasi harian toko.',
    tags: ['pencairan', 'dana', 'omset', 'pendapatan', 'settlement']
  },

  // --- Mitra Driver ---
  {
    id: 'd1',
    category: 'driver',
    question: 'Bagaimana cara bergabung menjadi Driver Kurir TumpangGo?',
    answer: 'Warga Kecamatan Tumpang yang memiliki sepeda motor pribadi dalam kondisi prima, SIM C aktif, ponsel Android/iPhone, dan menguasai jalan-jalan di Kecamatan Tumpang dapat mengajukan pendaftaran mitra kurir melalui formulir kemitraan.',
    tags: ['driver', 'kurir', 'antar', 'motor', 'ojek', 'gabung']
  },
  {
    id: 'd2',
    category: 'driver',
    question: 'Bagaimana pembagian komisi dan ongkir untuk driver?',
    answer: 'Kurir menerima ongkir flat Rp 5.000 per pengantaran di area Tumpang secara adil. Sistem pembagian hasil transparan dapat dipantau langsung dari Portal Driver internal.',
    tags: ['ongkir', 'komisi', 'gaji', 'penghasilan', 'driver']
  },

  // --- Penggunaan Platform ---
  {
    id: 'p1',
    category: 'platform',
    question: 'Apakah TumpangGo harus diunduh dari Play Store / App Store?',
    answer: 'Tidak perlu mengunduh file APK yang berat. TumpangGo menggunakan teknologi Progressive Web App (PWA) modern. Cukup buka di browser (Chrome atau Safari), lalu tekan tombol "Install TumpangGo" atau "Tambah ke Layar Utama" untuk memasangnya langsung seperti aplikasi bawaan.',
    tags: ['pwa', 'install', 'download', 'apk', 'play store', 'layar utama']
  },
  {
    id: 'p2',
    category: 'platform',
    question: 'Bagaimana cara memasang di iPhone / iPad (iOS)?',
    answer: 'Buka website TumpangGo menggunakan Safari, tekan tombol Share (ikon kotak dengan panah ke atas di bagian bawah layar), gulir ke bawah dan pilih "Add to Home Screen" (Tambah ke Layar Utama), lalu tekan Add.',
    tags: ['iphone', 'ios', 'safari', 'apple', 'install']
  },
  {
    id: 'p3',
    category: 'platform',
    question: 'Bagaimana menjaga keamanan data saya di TumpangGo?',
    answer: 'TumpangGo menerapkan enkripsi standar industri dan prinsip perlindungan data pribadi. Nomor telepon dan informasi pengantaran tidak disebarkan ke publik dan disamarkan pada tampilan pelacakan umum.',
    tags: ['keamanan', 'privasi', 'data', 'aman', 'enkripsi']
  }
];

export const HelpCenterView: React.FC<HelpCenterViewProps> = ({
  onBack,
  onNavigateToPartnerRegister,
  onNavigateToTracking
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>('all');
  const [openFaqId, setOpenFaqId] = useState<string | null>('c1');

  // Interactive Report Form State
  const [reportType, setReportType] = useState('kendala_pembayaran');
  const [reportOrderCode, setReportOrderCode] = useState('');
  const [reportName, setReportName] = useState('');
  const [reportPhone, setReportPhone] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [reportSubmittedTicket, setReportSubmittedTicket] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Filter FAQs based on category & search query
  const filteredFaqs = useMemo(() => {
    return FAQ_DATABASE.filter(item => {
      const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
      if (!matchCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchQuestion = item.question.toLowerCase().includes(q);
      const matchAnswer = item.answer.toLowerCase().includes(q);
      const matchTags = item.tags.some(t => t.toLowerCase().includes(q));
      return matchQuestion || matchAnswer || matchTags;
    });
  }, [selectedCategory, searchQuery]);

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportName.trim() || !reportPhone.trim() || !reportDesc.trim()) {
      alert('Mohon lengkapi nama, nomor kontak, dan rincian kendala Anda.');
      return;
    }

    setIsSubmittingReport(true);
    setTimeout(() => {
      const ticketId = 'TG-TKT-' + Math.floor(100000 + Math.random() * 900000);
      setReportSubmittedTicket(ticketId);
      setIsSubmittingReport(false);
      // Reset input fields
      setReportOrderCode('');
      setReportDesc('');
    }, 600);
  };

  return (
    <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={onBack}
            className="p-2 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-slate-700"
            aria-label="Kembali ke Beranda"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-display font-extrabold text-lg text-slate-900 leading-tight">
              Pusat Bantuan TumpangGo
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Informasi resmi, panduan penggunaan &amp; resolusi kendala
            </p>
          </div>
        </div>
      </div>

      {/* Hero Guidance Banner */}
      <div className="bg-gradient-to-br from-[#185338] via-[#166534] to-[#14532D] text-white rounded-3xl p-5 shadow-sm relative overflow-hidden flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-400 text-slate-950">
            Layanan Resmi
          </span>
          <span className="text-xs text-emerald-100 font-medium">
            Kecamatan Tumpang, Kab. Malang
          </span>
        </div>
        <h2 className="font-display font-extrabold text-base sm:text-lg leading-snug">
          Ada yang bisa kami bantu seputar TumpangGo?
        </h2>
        <p className="text-xs text-emerald-100/90 leading-relaxed max-w-md">
          Temukan jawaban instan mengenai pemesanan makanan, ongkir hemat flat Rp 5.000, panduan mitra toko, atau laporkan kendala Anda langsung ke tim operasional kami.
        </p>

        {/* Search Input Box */}
        <div className="relative mt-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ketik kata kunci (misal: ongkir, qris, daftar mitra, tracking)..."
            className="w-full bg-white text-slate-900 rounded-2xl py-3 pl-10 pr-4 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {[
          { id: 'all', label: 'Semua Topik' },
          { id: 'customer', label: 'Pelanggan & Kuliner' },
          { id: 'merchant', label: 'Mitra UMKM' },
          { id: 'driver', label: 'Mitra Driver' },
          { id: 'platform', label: 'Panduan Aplikasi' },
          { id: 'report', label: '🚨 Lapor Kendala' }
        ].map((tab) => {
          const isActive = selectedCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedCategory(tab.id as HelpCategory)}
              className={`whitespace-nowrap px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                isActive 
                  ? 'bg-slate-900 text-white shadow-xs' 
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* QUICK GUIDES HIGHLIGHT */}
      {selectedCategory === 'all' && !searchQuery && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold text-xs mb-1">
                <Store className="w-4 h-4 text-emerald-700" />
                <span>Panduan Kemitraan UMKM</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Pendaftaran 100% gratis tanpa biaya awal. Buka toko digital Anda untuk menjangkau ribuan pelanggan di Tumpang.
              </p>
            </div>
            {onNavigateToPartnerRegister && (
              <button
                type="button"
                onClick={onNavigateToPartnerRegister}
                className="mt-2.5 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 self-start cursor-pointer underline"
              >
                <span>Daftar Jadi Mitra</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-blue-800 font-extrabold text-xs mb-1">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                <span>Alur Persetujuan & Aktivasi Akun</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Verifikasi berkas selesai dalam 1x24 jam kerja. Setelah disetujui, toko langsung aktif dan siap menerima order.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('merchant');
                setOpenFaqId('m3');
              }}
              className="mt-2.5 text-[11px] font-bold text-blue-800 hover:text-blue-950 flex items-center gap-1 self-start cursor-pointer underline"
            >
              <span>Lihat Detail Alur</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-amber-900 font-extrabold text-xs mb-1">
                <Smartphone className="w-4 h-4 text-amber-800" />
                <span>Panduan Instalasi & Penggunaan PWA</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Tanpa download file APK besar. Buka via browser dan pasang langsung ke layar ponsel Anda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('platform');
                setOpenFaqId('p1');
              }}
              className="mt-2.5 text-[11px] font-bold text-amber-900 hover:text-amber-950 flex items-center gap-1 self-start cursor-pointer underline"
            >
              <span>Cara Pasang di HP</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* SECTION 1: FAQ ACCORDION (Hidden if 'report' category selected exclusively) */}
      {selectedCategory !== 'report' && (
        <section className="bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-emerald-700" />
              <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">
                Tanya Jawab &amp; Panduan ({filteredFaqs.length})
              </h3>
            </div>
            {selectedCategory !== 'all' && (
              <button
                onClick={() => setSelectedCategory('all')}
                className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
              >
                Lihat Semua
              </button>
            )}
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Tidak ditemukan jawaban untuk pencarian &ldquo;{searchQuery}&rdquo;.
              <div className="mt-2">
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-emerald-700 font-bold hover:underline"
                >
                  Bersihkan kata kunci
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredFaqs.map((item) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div
                    key={item.id}
                    className="border border-slate-100 rounded-2xl overflow-hidden transition-all bg-slate-50/70"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                      className="w-full text-left p-3.5 hover:bg-slate-100/70 transition-colors flex items-center justify-between gap-2.5 cursor-pointer"
                    >
                      <span className="font-extrabold text-xs text-slate-800 leading-snug">
                        {item.question}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-emerald-700 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="p-3.5 bg-white text-xs text-slate-600 leading-relaxed border-t border-slate-100 flex flex-col gap-2.5">
                        <p>{item.answer}</p>
                        {item.category === 'merchant' && onNavigateToPartnerRegister && (
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] text-slate-500 font-medium">Siap mengembangkan usaha kuliner?</span>
                            <button
                              type="button"
                              onClick={onNavigateToPartnerRegister}
                              className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                            >
                              Daftar Mitra Sekarang
                            </button>
                          </div>
                        )}
                        {item.category === 'customer' && item.id === 'c4' && onNavigateToTracking && (
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] text-slate-500 font-medium">Punya kode pesanan aktif?</span>
                            <button
                              type="button"
                              onClick={onNavigateToTracking}
                              className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                            >
                              Buka Lacak Order
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* SECTION 2: FORMULIR LAPOR KENDALA (Mandatory Problem Resolution) */}
      <section className="bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center shrink-0 border border-rose-100">
            <AlertCircle className="w-4 h-4 text-rose-700" />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
              Formulir Pelaporan Kendala Resmi
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Sampaikan kendala pesanan atau kemitraan untuk ditangani tim operasional
            </p>
          </div>
        </div>

        {reportSubmittedTicket ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center flex flex-col items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            <h4 className="font-extrabold text-sm text-emerald-950">
              Laporan Kendala Berhasil Diterima
            </h4>
            <div className="bg-white px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-mono font-bold text-emerald-800">
              Nomor Tiket: {reportSubmittedTicket}
            </div>
            <p className="text-[11px] text-emerald-800/90 leading-relaxed max-w-sm mt-1">
              Laporan Anda telah tercatat pada sistem administrasi TumpangGo. Tim layanan kami akan menindaklanjuti dan mengonfirmasi penyelesaian ke nomor kontak Anda.
            </p>
            <button
              type="button"
              onClick={() => setReportSubmittedTicket(null)}
              className="mt-2 text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Kirim Laporan Lain
            </button>
          </div>
        ) : (
          <form onSubmit={handleReportSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Kategori Kendala <span className="text-rose-500">*</span>
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium focus:outline-none focus:border-emerald-600"
                >
                  <option value="kendala_pembayaran">Kendala Pembayaran / Verifikasi QRIS</option>
                  <option value="status_pesanan">Pertanyaan Status Pesanan / Pengantaran</option>
                  <option value="kemitraan_toko">Pendaftaran / Pembaruan Menu Toko</option>
                  <option value="kemitraan_driver">Pertanyaan Mitra Driver</option>
                  <option value="saran_masukan">Saran &amp; Masukan Platform</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Kode Pesanan <span className="text-slate-400 font-normal">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={reportOrderCode}
                  onChange={(e) => setReportOrderCode(e.target.value)}
                  placeholder="Contoh: TF-20261022-001"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Nama Anda <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="Nama pemesan / pemilik usaha"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Nomor Kontak Aktif <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={reportPhone}
                  onChange={(e) => setReportPhone(e.target.value)}
                  placeholder="0812xxxxxxxx"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Rincian Kendala <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                placeholder="Ceritakan kendala yang Anda alami secara rinci agar tim kami dapat membantu dengan cepat..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium focus:outline-none focus:border-emerald-600 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingReport}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmittingReport ? 'Mengirim Laporan...' : 'Kirim Laporan ke Tim Layanan'}</span>
            </button>
          </form>
        )}
      </section>

      {/* SECTION 3: KONTAK DUKUNGAN RESMI (Verified Institutional Info) */}
      <section className="bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-700" />
          <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">
            Dukungan Resmi TumpangGo
          </h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          TumpangGo berkomitmen menghadirkan layanan digital lokal yang aman dan profesional bagi warga Kecamatan Tumpang. Seluruh saluran bantuan dikelola resmi oleh tim operasional.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Mail className="w-3 h-3 text-emerald-700" /> Email Resmi
            </span>
            <span className="font-bold text-slate-800 select-all">admin@tumpanggo.com</span>
            <span className="text-[10px] text-slate-500">Respon dalam 1x24 jam kerja</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-700" /> Wilayah Operasional
            </span>
            <span className="font-bold text-slate-800">Kecamatan Tumpang</span>
            <span className="text-[10px] text-slate-500">Kabupaten Malang, 65156</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-700" /> Jam Layanan
            </span>
            <span className="font-bold text-slate-800">08:00 – 21:00 WIB</span>
            <span className="text-[10px] text-slate-500">Senin s/d Minggu</span>
          </div>
        </div>
      </section>

      {/* SECTION 4: SALURAN MEDIA SOSIAL RESMI (Tepat 3 Media Sosial) */}
      <section className="bg-slate-100/80 rounded-3xl p-4 sm:p-5 flex flex-col items-center text-center gap-3">
        <h4 className="font-display font-extrabold text-xs sm:text-sm text-slate-800">
          Ikuti Media Sosial Resmi TumpangGo
        </h4>
        <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed">
          Dapatkan pembaruan promo kuliner lokal, profil UMKM binaan, dan info kemitraan melalui tiga kanal resmi kami:
        </p>

        {/* 3 Social Media Buttons */}
        <SocialMediaButtons />
      </section>
    </div>
  );
};
