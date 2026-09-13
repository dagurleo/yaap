import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { demoFn } from "@/features/dashboard/public-functions";
export const Route = createFileRoute("/demo")({
  beforeLoad: async () => {
    const publicId = await demoFn();
    throw redirect({
      to: "/share/$publicId/$report",
      params: { publicId, report: "overview" },
      search: { days: 30 },
    });
  },
  errorComponent: () => (
    <section className="py-20">
      <h1>Demo unavailable</h1>
      <p>The demo has not been configured yet.</p>
      <Link to="/">Back to Yaap</Link>
    </section>
  ),
});
