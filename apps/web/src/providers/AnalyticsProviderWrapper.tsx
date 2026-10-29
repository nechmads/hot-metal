import { useMemo } from "react";
import { useUser } from "@clerk/react";
import { AnalyticsProvider, type AnalyticsUser } from "@hotmetal/analytics";

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as
  | string
  | undefined;
const ANALYTICS_ENABLED = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
const IS_DEV = import.meta.env.DEV;

function resolveEnabled(): boolean {
  if (!POSTHOG_KEY) return false;
  if (IS_DEV) return ANALYTICS_ENABLED;
  return true;
}

export function AnalyticsProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoaded } = useUser();

  const analyticsUser = useMemo<AnalyticsUser | null>(() => {
    if (!isLoaded || !user) return null;
    return {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      createdAt: user.createdAt?.toISOString(),
    };
  }, [
    isLoaded,
    user?.id,
    user?.primaryEmailAddress?.emailAddress,
    user?.firstName,
    user?.lastName,
    user?.createdAt,
  ]);

  return (
    <AnalyticsProvider
      apiKey={POSTHOG_KEY}
      enabled={resolveEnabled()}
      debug={IS_DEV}
      user={analyticsUser}
    >
      {children}
    </AnalyticsProvider>
  );
}
