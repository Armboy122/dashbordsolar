import { Suspense } from "react";
import Prototype from "@/src/components/prototype/prototype";
import "./prototype.css";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">กำลังเปิดต้นแบบ…</p>}>
      <Prototype />
    </Suspense>
  );
}
