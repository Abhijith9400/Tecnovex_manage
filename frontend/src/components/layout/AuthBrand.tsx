import Image from "next/image";

export const COMPANY_NAME = "Tecnovex Digital Solutions";

/** Logo + company name shown above the sign-in, code and password-reset forms. */
export function AuthBrand() {
  return (
    <div className="mb-6 flex flex-col items-center">
      {/* The PNG has wide built-in padding; the clipped box trims it so the mark reads at a useful size. */}
      <div className="flex h-16 w-64 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-line">
        <Image src="/images/logo.png" alt={COMPANY_NAME} width={757} height={232} priority className="h-[84px] w-auto max-w-none" />
      </div>
    </div>
  );
}
