export type FieldOrthophoto = {
  file: string; width: number; credit: string; source: string; place?: string;
  center?: { latitude: number; longitude: number };
}

function aerial(id: string, place: string, width: number, latitude: number, longitude: number): FieldOrthophoto {
  return {
    file: 'training-' + id + '.webp', width, place, credit: 'USDA NAIP / USGS',
    source: 'https://www.usgs.gov/programs/national-geospatial-program/supporting-themes',
    center: { latitude, longitude },
  }
}

export const trainingImagery = {
  anadolu: aerial('anadolu', 'Boulder Reservoir, Colorado', 2800, 40.08539, -105.23270),
  ege: aerial('ege', 'Fort Pierce Inlet, Florida', 2800, 27.47652, -80.29210),
  alp: aerial('alp', 'Roaring Fork Vadisi, Colorado', 3600, 39.20325, -106.85530),
  col: aerial('col', 'Alvord Çölü, Oregon', 3400, 42.54145, -118.53250),
  kuzey: aerial('kuzey', 'Mount Rainier, Washington', 3300, 46.80240, -121.73550),
  sehir: aerial('sehir', 'Central Park, New York', 3000, 40.78165, -73.96657),
  ada: aerial('ada', 'Indian River Lagünü, Florida', 3300, 27.44375, -80.30980),
}
