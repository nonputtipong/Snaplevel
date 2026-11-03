/**
 * Static-friendly aurora background for the home page only. Layered,
 * blurred gradient blobs drifting slowly via transform keyframes
 * (see globals.css). No canvas, no JavaScript animation.
 */
const BLOBS = [
  {
    className:
      "-top-[12rem] left-1/2 -ml-[30rem] h-[30rem] w-[60rem] aurora-drift-a",
    background:
      "radial-gradient(closest-side, rgba(20,184,166,0.52), transparent)",
  },
  {
    className: "top-[22%] -right-[16rem] h-[26rem] w-[44rem] aurora-drift-b",
    background:
      "radial-gradient(closest-side, rgba(34,211,238,0.42), transparent)",
  },
  {
    className: "top-[38%] -left-[18rem] h-[28rem] w-[46rem] aurora-drift-c",
    background:
      "radial-gradient(closest-side, rgba(37,99,235,0.46), transparent)",
  },
  {
    className:
      "-bottom-[14rem] left-[8%] h-[24rem] w-[40rem] aurora-drift-a",
    background:
      "radial-gradient(closest-side, rgba(52,211,153,0.30), transparent)",
  },
];

export default function AuroraBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-slate-950"
    >
      {BLOBS.map((blob, index) => (
        <div
          key={index}
          className={`absolute rounded-full blur-[80px] ${blob.className}`}
          style={{ background: blob.background }}
        />
      ))}
      <div className="absolute inset-0 bg-slate-950/45" />
    </div>
  );
}
