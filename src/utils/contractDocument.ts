/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Partnership Contract & Legal Document Utility
 * Generates official downloadable PDF agreements and structured plain-text contracts
 * based on authentic platform rules (Flat Rp 5.000 delivery, 10% commission, H+1 settlement, Kecamatan Tumpang area).
 */

import { jsPDF } from 'jspdf';

export const OFFICIAL_CONTRACT_VERSION = 'PKS-TUMPANGGO-2026.1';
export const OFFICIAL_DRIVER_CONTRACT_VERSION = 'PKS-DRIVER-TUMPANGGO-2026.1';

export interface ContractPartyInfo {
  storeName?: string;
  ownerName: string;
  phone: string;
  email?: string;
  address?: string;
  role: 'MERCHANT' | 'DRIVER';
}

export function getPartnershipContractText(info: ContractPartyInfo): string {
  const isMerchant = info.role === 'MERCHANT';
  const roleTitle = isMerchant ? 'MITRA TOKO / KULINER UMKM' : 'MITRA DRIVER / KURIR LOKAL';
  const version = isMerchant ? OFFICIAL_CONTRACT_VERSION : OFFICIAL_DRIVER_CONTRACT_VERSION;

  return `PERJANJIAN KERJA SAMA KEMITRAAN DIGITAL TUMPANGGO
Nomor Registrasi Regulasi: ${version}
Tanggal Berlaku: 2026

ANTARA
PIHAK PERTAMA:
Pengelola Ekosistem Digital tumpangGo
Wilayah Operasional: Kecamatan Tumpang, Kabupaten Malang, Jawa Timur

DENGAN
PIHAK KEDUA:
Peran: ${roleTitle}
Nama Pemilik / Penanggung Jawab: ${info.ownerName || '-'}
${isMerchant ? `Nama Usaha / Toko: ${info.storeName || '-'}\n` : ''}No. WhatsApp: ${info.phone || '-'}
Email: ${info.email || '-'}
Alamat / Domisili: ${info.address || 'Kecamatan Tumpang, Kabupaten Malang'}

---

PASAL 1: KETENTUAN UMUM & TUJUAN KERJA SAMA
1. Kerja sama ini bertujuan mendukung usaha lokal Kecamatan Tumpang naik kelas melalui digitalisasi pemesanan kuliner dan logistik pengantaran lokal.
2. Seluruh transaksi wajib mematuhi standar transparansi, keamanan data pengguna, dan perlindungan konsumen.

PASAL 2: TARIF LAYANAN & ONGKOS KIRIM
1. Tarif pengantaran pesanan makanan untuk seluruh wilayah Kecamatan Tumpang ditetapkan secara hemat dan terjangkau yaitu Flat Rp 5.000 per transaksi pengantaran.
2. Penyesuaian tarif hanya dapat dilakukan atas keputusan bersama manajemen tumpangGo dan mitra terdaftar.

PASAL 3: SISTEM KOMISI & BAGI HASIL
${isMerchant 
  ? '1. Komisi platform untuk kemitraan merchant kuliner ditetapkan sebesar 10% (sepuluh persen) dari nilai penjualan makanan kotor (subtotal).\n2. Tidak ada biaya pendaftaran awal, biaya bulanan tersembunyi, maupun penalti minimum pesanan.'
  : '1. Mitra Driver / Kurir menerima hak pendapatan ongkos kirim sesuai tarif flat pengantaran resmi.\n2. Pembagian hasil insentif driver diatur secara transparan melalui sistem pencatatan aplikasi.'}

PASAL 4: JADWAL PENCAIRAN DANA (SETTLEMENT)
1. Pencairan dana hasil transaksi merchant terjadwal secara berkala H+1 setelah pesanan diselesaikan (Status: COMPLETED).
2. Dana dicairkan langsung ke rekening bank atau dompet digital resmi yang didaftarkan oleh pemilik usaha.

PASAL 5: KEBERSIHAN, STANDAR KUALITAS & KEJUJURAN
1. Mitra wajib menyajikan produk yang bersih, higienis, halal/jelas komposisinya, dan sesuai dengan deskripsi serta foto menu.
2. Harga makanan yang dicantumkan pada platform tumpangGo wajib wajar dan mencerminkan harga riil usaha.

PASAL 6: STATUS PENDAFTARAN & PERSETUJUAN ADMINISTRATOR
1. Setiap pendaftaran mitra baru berstatus "PENDING" (Menunggu Peninjauan).
2. Akses operasional dan penerimaan pesanan hanya dapat berjalan aktif setelah pendaftaran diverifikasi dan disetujui secara resmi oleh Administrator tumpangGo.
3. Administrator berhak menonaktifkan akun mitra apabila terbukti melanggar integritas layanan atau ketentuan hukum yang berlaku.

---
Dokumen ini disetujui secara elektronik melalui checkbox persetujuan wajib saat pendaftaran pada platform resmi tumpangGo.`;
}

export function downloadPartnershipContractPdf(info: ContractPartyInfo): void {
  try {
    const isMerchant = info.role === 'MERCHANT';
    const version = isMerchant ? OFFICIAL_CONTRACT_VERSION : OFFICIAL_DRIVER_CONTRACT_VERSION;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const primaryColor = [21, 128, 61]; // #15803D (Forest Green)
    const textColor = [30, 41, 59]; // #1E293B (Slate-800)
    const mutedColor = [100, 116, 139]; // #64748B (Slate-500)

    // Page dimensions
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 18;

    // Header Band
    doc.setFillColor(240, 253, 244); // Primary-50
    doc.rect(10, 10, pageWidth - 20, 28, 'F');
    doc.setDrawColor(187, 247, 208); // Primary-200
    doc.rect(10, 10, pageWidth - 20, 28, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('TUMPANGGO – PERJANJIAN KEMITRAAN RESMI', 15, y);

    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFont('helvetica', 'normal');
    doc.text(`Standar Operasional & Kontrak Kemitraan Digital Kecamatan Tumpang | Kode Regulasi: ${version}`, 15, y);

    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
    doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 15, y);

    y += 18;

    // Party Information Box
    doc.setFillColor(248, 250, 252);
    doc.rect(10, y, pageWidth - 20, 34, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, y, pageWidth - 20, 34, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('INFORMASI CALON MITRA TERDAFTAR:', 15, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    const col1X = 15;
    const col2X = 105;

    doc.text(`Nama Pemilik: ${info.ownerName || '-'}`, col1X, y + 13);
    if (isMerchant) {
      doc.text(`Nama Toko: ${info.storeName || '-'}`, col1X, y + 19);
    } else {
      doc.text(`Peran: Mitra Kurir / Driver Lokal`, col1X, y + 19);
    }
    doc.text(`Alamat: ${info.address || 'Kecamatan Tumpang, Kabupaten Malang'}`, col1X, y + 25);

    doc.text(`No. WhatsApp: ${info.phone || '-'}`, col2X, y + 13);
    doc.text(`Email: ${info.email || '-'}`, col2X, y + 19);
    doc.text(`Status Pendaftaran: PENDING (Menunggu Persetujuan Admin)`, col2X, y + 25);

    y += 42;

    // Contract Articles
    const articles = [
      {
        title: 'PASAL 1: KETENTUAN UMUM & MISI USAHA LOKAL',
        content: 'Perjanjian ini mengikat Calon Mitra dan Manajemen tumpangGo untuk bersama-sama mendigitalisasi potensi UMKM kuliner di Kecamatan Tumpang, Kabupaten Malang dengan prinsip keadilan, keterbukaan, dan saling menguntungkan.'
      },
      {
        title: 'PASAL 2: TARIF PENGANTARAN HEMAT FLAT RP 5.000',
        content: 'Tarif ongkos kirim pesanan makanan antar-desa se-Kecamatan Tumpang disepakati bertarif hemat Flat Rp 5.000 per transaksi guna menjaga keterjangkauan bagi masyarakat dan mendorong volume pesanan yang konsisten.'
      },
      {
        title: 'PASAL 3: SKEMA KOMISI & BAGI HASIL TRANSPARAN',
        content: isMerchant
          ? 'Platform tumpangGo mengenakan komisi pemeliharaan sistem sebesar 10% dari nilai subtotal makanan yang berhasil diselesaikan. Tidak dikenakan biaya aktivasi di muka maupun biaya penalti.'
          : 'Mitra Kurir menerima hak tarif pengantaran secara penuh sesuai dengan sistem bagi hasil logistik lokal tumpangGo yang tercatat secara transparan di aplikasi.'
      },
      {
        title: 'PASAL 4: JADWAL PENCAIRAN HASIL PENJUALAN (SETTLEMENT H+1)',
        content: 'Hasil penjualan bersih setelah dipotong komisi resmi akan direkap dan dicairkan secara terjadwal H+1 setelah pesanan diselesaikan (COMPLETED) ke rekening bank atau e-wallet mitra yang sah.'
      },
      {
        title: 'PASAL 5: KEBERSIHAN, STANDAR KUALITAS & INTEGRITAS',
        content: 'Mitra bertanggung jawab penuh atas higienitas bahan, kepatuhan harga riil menu, kehalalan/kejelasan produk, serta ketepatan waktu pengolahan makanan demi menjaga kepercayaan pelanggan.'
      },
      {
        title: 'PASAL 6: VERIFIKASI ADMINISTRATOR & STATUS PENDING',
        content: 'Pendaftaran mitra otomatis berstatus PENDING hingga dokumen dan lokasi divalidasi oleh Administrator tumpangGo. Akun yang belum disetujui tidak diizinkan menerima pesanan atau transaksi komersial.'
      }
    ];

    doc.setFontSize(8.5);
    for (const art of articles) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(art.title, 12, y);
      y += 4.5;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      const splitText = doc.splitTextToSize(art.content, pageWidth - 24);
      doc.text(splitText, 12, y);
      y += splitText.length * 4 + 4;
    }

    // Signature / Approval confirmation footer
    y = Math.max(y + 4, 252);
    doc.setDrawColor(226, 232, 240);
    doc.line(10, y, pageWidth - 10, y);
    y += 5;

    doc.setFontSize(7.5);
    doc.setTextColor(mutedColor[0], mutedColor[1], mutedColor[2]);
    doc.text('Pernyataan Hukum: Dokumen ini sah dan diterbitkan secara digital oleh tumpangGo Indonesia.', 12, y);
    doc.text(`Persetujuan dicatat secara elektronik pada sistem basis data tumpangGo sesuai UU ITE yang berlaku.`, 12, y + 4);

    const safeName = (info.storeName || info.ownerName || 'Mitra').replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Kontrak_Kemitraan_TumpangGo_${safeName}_${version}.pdf`);
  } catch (err) {
    console.error('Failed to generate PDF contract:', err);
    // Fallback: trigger plain-text download
    const text = getPartnershipContractText(info);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kontrak_Kemitraan_TumpangGo_${OFFICIAL_CONTRACT_VERSION}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}
