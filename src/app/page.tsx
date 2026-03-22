import dynamic from "next/dynamic";
import Nav from "@/components/Nav";

const DataTree = dynamic(() => import("@/components/DataTree"), { ssr: false });

export default function Home() {
  return (
    <>
      {/* Scroll spacer — creates body scroll height for wheel events */}
      <div style={{ height: '400vh' }} />

      {/* Nav overlays on top at z-index 50 */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50 }}>
        <Nav />
      </div>

      {/* Full-viewport hero */}
      <DataTree />
    </>
  );
}
