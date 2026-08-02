import { redirect } from "next/navigation";

// Upload now lives directly on the landing page ("/"). This route is kept
// only so any existing link to /upload still lands somewhere useful.
export default function UploadPage() {
  redirect("/");
}
