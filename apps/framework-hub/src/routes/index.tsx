import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { localeFromBrowser } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: RootRedirect,
});

function RootRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({
      to: "/$locale",
      params: { locale: localeFromBrowser() },
      replace: true,
    });
  }, [navigate]);

  return <div className="min-h-screen bg-background" aria-hidden />;
}
