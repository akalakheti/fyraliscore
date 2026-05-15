import DemoLanding from "./DemoLanding";
import LandingPage from "./LandingPage";
import { DEMO_LS_KEYS } from "@/api/demo-picker-client";

function readSessionId(): string | null {
  try {
    return localStorage.getItem(DEMO_LS_KEYS.sessionId);
  } catch {
    return null;
  }
}

export default function RootRoute() {
  const sessionId = readSessionId();
  if (sessionId && sessionId.length > 0) {
    return <DemoLanding />;
  }
  return <LandingPage />;
}
