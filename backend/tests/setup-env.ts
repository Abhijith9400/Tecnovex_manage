import "dotenv/config";

// Point the app at the test database before any application module is imported.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET ??= "test-secret-that-is-definitely-long-enough-for-tests";
process.env.UPLOAD_DIR = "uploads/test";
// Most suites test other features; otp.test.ts switches email OTP on for itself.
process.env.LOGIN_OTP_ENABLED = "false";
// Never send real email from tests, even when SMTP is configured in .env; messages go to devOutbox.
process.env.SMTP_HOST = "";
