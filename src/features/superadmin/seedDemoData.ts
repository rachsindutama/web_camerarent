import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function seedSampleRentalHouse(): Promise<string> {
  if (!db) throw new Error('Firestore not initialized.');

  const tenantRef = doc(collection(db, 'tenants'));
  const tenantId = tenantRef.id;

  await setDoc(tenantRef, {
    name: 'CameraRent Jakarta Selatan',
    slug: 'camerarent-jaksel',
    address: 'Jl. Kemang Raya No. 48, Bangka, Mampang Prapatan, Jakarta Selatan 12730',
    coordinates: { lat: -6.2607, lng: 106.8135 },
    deliveryRatePerKm: 12000,
    bufferHours: 3,
    overdueGraceMinutes: 60,
    overdueHourlyRatePercent: 10,
    bankDetails: {
      bankName: 'BCA',
      accountNumber: '5270819442',
      accountHolder: 'PT CameraRent Visual Nusantara',
    },
    status: 'active',
    createdAt: serverTimestamp(),
  });

  const sampleEquipment = [
    {
      key: 'a7iv',
      name: 'Sony Alpha a7 IV Body',
      category: 'camera',
      brand: 'Sony',
      dailyRate: 450000,
      depositAmount: 1000000,
      specs: {
        Sensor: '33MP Full-Frame Exmor R CMOS',
        Video: '4K 60p 10-bit 4:2:2',
        Mount: 'Sony E-Mount',
      },
      units: [
        {
          serialNumber: 'SN-A7IV-00412',
          condition: 'mint',
          accessoriesIncluded: ['2x NP-FZ100 Battery', 'Dual Charger', '64GB CFexpress Type A', 'Body Cap'],
        },
        {
          serialNumber: 'SN-A7IV-00419',
          condition: 'good',
          accessoriesIncluded: ['2x NP-FZ100 Battery', 'Dual Charger', '128GB V90 SD Card', 'Body Cap'],
        },
      ],
    },
    {
      key: 'fx3',
      name: 'Sony FX3 Full-Frame Cinema Line',
      category: 'camera',
      brand: 'Sony',
      dailyRate: 750000,
      depositAmount: 2000000,
      specs: {
        Sensor: '12.1MP Full-Frame Dual Base ISO',
        Video: '4K 120p 10-bit S-Log3',
        Audio: 'XLR Top Handle Included',
      },
      units: [
        {
          serialNumber: 'SN-FX3-00108',
          condition: 'mint',
          accessoriesIncluded: ['XLR-H1 Top Handle', '3x NP-FZ100 Battery', '160GB CFexpress Type A', 'Tilta Half Cage'],
        },
      ],
    },
    {
      key: 'rf2470',
      name: 'Canon RF 24-70mm f/2.8L IS USM',
      category: 'lens',
      brand: 'Canon',
      dailyRate: 300000,
      depositAmount: 750000,
      specs: {
        Aperture: 'f/2.8 Constant',
        Stabilization: '5-Stop Optical IS',
        Filter: '82mm Thread',
      },
      units: [
        {
          serialNumber: 'SN-RF2470-8821',
          condition: 'mint',
          accessoriesIncluded: ['EW-88E Lens Hood', '82mm UV Filter', 'Front & Rear Caps', 'Padded Pouch'],
        },
        {
          serialNumber: 'SN-RF2470-8834',
          condition: 'good',
          accessoriesIncluded: ['EW-88E Lens Hood', '82mm Variable ND', 'Front & Rear Caps'],
        },
      ],
    },
    {
      key: 'fe2470gm2',
      name: 'Sony FE 24-70mm f/2.8 GM II',
      category: 'lens',
      brand: 'Sony',
      dailyRate: 350000,
      depositAmount: 800000,
      specs: {
        Aperture: 'f/2.8 Constant',
        Weight: '695g',
        Filter: '82mm Thread',
      },
      units: [
        {
          serialNumber: 'SN-GM2470-5501',
          condition: 'mint',
          accessoriesIncluded: ['ALC-SH168 Hood', '82mm Clear Filter', 'Hard Case'],
        },
      ],
    },
    {
      key: 'rs3pro',
      name: 'DJI RS 3 Pro Gimbal Stabilizer',
      category: 'stabilizer',
      brand: 'DJI',
      dailyRate: 275000,
      depositAmount: 600000,
      specs: {
        Payload: '4.5 kg Tested Payload',
        Focus: 'LiDAR Ready / Automated Axis Locks',
        Battery: 'BG30 Grip (12h Runtime)',
      },
      units: [
        {
          serialNumber: 'SN-RS3P-29014',
          condition: 'good',
          accessoriesIncluded: ['BG30 Battery Grip', 'Quick-Release Plate', 'Focus Motor Rod', 'Carry Case'],
        },
      ],
    },
    {
      key: 'aputure600d',
      name: 'Aputure LS 600d Pro Daylight LED',
      category: 'lighting',
      brand: 'Aputure',
      dailyRate: 500000,
      depositAmount: 1200000,
      specs: {
        Output: '600W COB / 5600K',
        Mount: 'Bowens S-Mount',
        Power: 'AC + Dual V-Mount Plate',
      },
      units: [
        {
          serialNumber: 'SN-AP600D-7712',
          condition: 'mint',
          accessoriesIncluded: ['Control Box', 'Hyper Reflector', 'Lightning Clamp', 'Rolling Hard Case'],
        },
      ],
    },
  ] as const;

  const eqIdsByKey: Record<string, string> = {};

  for (const eq of sampleEquipment) {
    const eqRef = doc(collection(db, 'equipment'));
    eqIdsByKey[eq.key] = eqRef.id;

    await setDoc(eqRef, {
      tenantId,
      name: eq.name,
      category: eq.category,
      brand: eq.brand,
      dailyRate: eq.dailyRate,
      depositAmount: eq.depositAmount,
      specs: eq.specs,
      images: [],
      totalUnits: eq.units.length,
      isActive: true,
    });

    for (const unit of eq.units) {
      const unitRef = doc(collection(db, 'equipment_units'));
      await setDoc(unitRef, {
        equipmentId: eqRef.id,
        tenantId,
        serialNumber: unit.serialNumber,
        condition: unit.condition,
        status: 'available',
        accessoriesIncluded: [...unit.accessoriesIncluded],
        lastCheckedAt: Timestamp.now(),
      });
    }
  }

  // Create 2 production bundles
  await setDoc(doc(collection(db, 'bundles')), {
    tenantId,
    name: 'Documentary Run-and-Gun Kit',
    description: 'Sony FX3 Cinema Line + FE 24-70mm f/2.8 GM II + DJI RS 3 Pro ready for single-operator commercial or documentary shoots.',
    equipmentIds: [eqIdsByKey.fx3, eqIdsByKey.fe2470gm2, eqIdsByKey.rs3pro],
    bundleDailyRate: 1150000,
    bundleDeposit: 2500000,
    isActive: true,
  });

  await setDoc(doc(collection(db, 'bundles')), {
    tenantId,
    name: 'Hybrid Stills & Video Interview Kit',
    description: 'Sony a7 IV Body paired with Aputure LS 600d Pro daylight COB for studio interviews and corporate profiles.',
    equipmentIds: [eqIdsByKey.a7iv, eqIdsByKey.aputure600d],
    bundleDailyRate: 825000,
    bundleDeposit: 1800000,
    isActive: true,
  });

  return tenantId;
}

