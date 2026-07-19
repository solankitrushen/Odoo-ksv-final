import { redirect } from "next/navigation";

/** Legacy route — create is a modal on /products now. */
export default function NewProductRedirectPage() {
  redirect("/products");
}
