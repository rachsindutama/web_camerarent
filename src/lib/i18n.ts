import { useLanguageStore, type AppLanguage } from '@/store/useLanguageStore';

export type { AppLanguage };

export function getAppLanguage(): AppLanguage {
  return useLanguageStore.getState().lang;
}

/**
 * Non-React helper for translating static utilities, toasts, and formatters.
 * English ('en') is the default language; Indonesian ('id') is returned when toggled.
 */
export function txStatic(en: string, id: string, lang: AppLanguage = getAppLanguage()): string {
  return lang === 'id' ? id : en;
}

export const COMMON_DICTIONARY = {
  en: {
    'common.save': 'Save',
    'common.saveChanges': 'Save Changes',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.close': 'Close',
    'common.search': 'Search...',
    'common.loading': 'Loading...',
    'common.all': 'All',
    'common.prev': 'Prev',
    'common.next': 'Next',
    'common.page': 'Page',
    'common.show': 'Show',
    'common.perPage': '/ page',
    'common.signIn': 'Sign In',
    'common.register': 'Register',
    'common.signOut': 'Sign Out',
    'common.allBranches': 'All Branches',
    'common.branch': 'Branch',
    'common.actions': 'Actions',
    'common.status': 'Status',
    'common.notes': 'Notes',
    'common.total': 'Total',
    'common.deposit': 'Deposit',
    'common.day': 'day',
    'common.days': 'days',
    'common.free': 'free',
    'common.resetDefault': 'Reset Default',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.upload': 'Upload',
    'common.remove': 'Remove',
  },
  id: {
    'common.save': 'Simpan',
    'common.saveChanges': 'Simpan Perubahan',
    'common.cancel': 'Batal',
    'common.delete': 'Hapus',
    'common.edit': 'Edit',
    'common.close': 'Tutup',
    'common.search': 'Cari...',
    'common.loading': 'Memuat...',
    'common.all': 'Semua',
    'common.prev': 'Sebelumnya',
    'common.next': 'Berikutnya',
    'common.page': 'Halaman',
    'common.show': 'Tampilkan',
    'common.perPage': '/ halaman',
    'common.signIn': 'Masuk',
    'common.register': 'Daftar',
    'common.signOut': 'Keluar',
    'common.allBranches': 'Semua Cabang',
    'common.branch': 'Cabang',
    'common.actions': 'Aksi',
    'common.status': 'Status',
    'common.notes': 'Catatan',
    'common.total': 'Total',
    'common.deposit': 'Deposit',
    'common.day': 'hari',
    'common.days': 'hari',
    'common.free': 'tersedia',
    'common.resetDefault': 'Reset Default',
    'common.confirm': 'Konfirmasi',
    'common.back': 'Kembali',
    'common.upload': 'Unggah',
    'common.remove': 'Hapus',
  },
} as const;

export type CommonKey = keyof typeof COMMON_DICTIONARY.en;

