import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/share/$publicId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/share/$publicId/$report",
      params: { ...params, report: "overview" },
      search: { days: 7 },
    });
  },
});
