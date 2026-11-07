  // "standalone" makes `next build` emit a self-contained server (.next/standalone), which is what the Docker image runs.
  // It doesn't change `npm run dev`.
export default { output: "standalone" };