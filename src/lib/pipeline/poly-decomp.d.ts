declare module "poly-decomp" {
  interface PolyDecomp {
    makeCCW(polygon: number[][]): void;
    removeCollinearPoints(polygon: number[][], precision: number): void;
    removeDuplicatePoints?(polygon: number[][], precision: number): void;
    quickDecomp(polygon: number[][]): [number, number][][];
  }
  const decomp: PolyDecomp;
  export default decomp;
}
