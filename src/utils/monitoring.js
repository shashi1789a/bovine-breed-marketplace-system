let sentry = null;

const SERVER_ERROR = 500;

export const initMonitoring = async () => {
    const dsn = process.env.SENTRY_DSN;

    if (!dsn) return false;

    try {
        sentry = await import("@sentry/node");

        sentry.init({
            dsn,
            environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
            release: process.env.RENDER_GIT_COMMIT || process.env.SENTRY_RELEASE || undefined,
            tracesSampleRate: Math.min(Math.max(Number(process.env.SENTRY_TRACES_RATE) || 0, 0), 1),
            sendDefaultPii: false
        });

        console.log("[monitoring] Sentry error reporting is on");

        return true;
    } catch (error) {
        sentry = null;
        console.warn("[monitoring] @sentry/node is not installed, error reporting is off:", error.message);

        return false;
    }
};

export const monitoringEnabled = () => Boolean(sentry);

export const captureError = (error, context = {}) => {
    if (!sentry) return;

    const status = Number(error?.statusCode) || SERVER_ERROR;

    if (status < SERVER_ERROR) return;

    try {
        sentry.withScope((scope) => {
            for (const [key, value] of Object.entries(context)) scope.setTag(key, String(value).slice(0, 200));
            sentry.captureException(error);
        });
    } catch (reportError) {
        console.error("[monitoring] could not report error:", reportError.message);
    }
};

export const flushMonitoring = async (timeoutMs = 2000) => {
    if (!sentry) return;

    try {
        await sentry.flush(timeoutMs);
    } catch {
        return;
    }
};
