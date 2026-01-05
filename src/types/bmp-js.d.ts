declare module "bmp-js" {
  export function decode(
    input: Buffer,
  ): {
    data: Uint8Array;
    width: number;
    height: number;
  };
}



