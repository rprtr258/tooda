export type Vec2 = [number, number];
type Vec3 = [number, number, number];

export type Mat3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export const eye = scale(1);

export function compose(...ms: Mat3[]): Mat3 {
  let res: Mat3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let m of ms) {
    let newRes: Mat3 = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          newRes[i][j] += m[i][k] * res[k][j];
        }
      }
    }
    res = newRes;
  }
  return res;
}

export function invert(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const invDet = 1 / det;
  return compose(
    [
      [e * i - f * h, c * h - b * i, b * f - c * e],
      [f * g - d * i, a * i - c * g, c * d - a * f],
      [d * h - e * g, b * g - a * h, a * e - b * d],
    ],
    [
      [invDet, 0, 0],
      [0, invDet, 0],
      [0, 0, invDet],
    ],
  );
}

export function translate(v: Vec2): Mat3 {
  return [
    [1, 0, v[0]],
    [0, 1, v[1]],
    [0, 0, 1],
  ];
}

export function scale(coeff: number): Mat3 {
  return [
    [coeff, 0, 0],
    [0, coeff, 0],
    [0, 0, 1],
  ];
}

export function apply([m0, m1, m2]: Mat3, v2: Vec2): Vec2 {
  const v = [v2[0], v2[1], 1];
  const x = m0[0] * v[0] + m0[1] * v[1] + m0[2] * v[2];
  const y = m1[0] * v[0] + m1[1] * v[1] + m1[2] * v[2];
  const z = m2[0] * v[0] + m2[1] * v[1] + m2[2] * v[2];
  return [x / z, y / z];
}

export function sub(v1: Vec2, v2: Vec2): Vec2 {
  return [v1[0] - v2[0], v1[1] - v2[1]];
}

export function add(v1: Vec2, v2: Vec2): Vec2 {
  return [v1[0] + v2[0], v1[1] + v2[1]];
}

export function mul(v: Vec2, k: number): Vec2 {
  return [v[0] * k, v[1] * k];
}

export function len(v: Vec2): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

export type Rectangle = {
  at: Vec2;
  width: number;
  height: number;
};

export function download(filename: string, text: string): void {
  const el = document.createElement('a');
  el.setAttribute(
    'href',
    'data:application/json;charset=utf-8,' + encodeURIComponent(text),
  );
  el.setAttribute('download', filename);
  el.style.display = 'none';
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
}

export async function load(): Promise<string> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('input');
    el.type = 'file';
    el.addEventListener('change', function (e) {
      const file = (e.target! as HTMLInputElement).files![0]; // Get the first file
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          resolve(e.target!.result?.toString()!);
        };
        reader.readAsText(file); // For text files. For binary, we might use readAsArrayBuffer, etc.
      }
    });
    document.body.appendChild(el);
    try {
      el.click();
    } catch (e) {
      reject(e);
    } finally {
      document.body.removeChild(el);
    }
  });
}
