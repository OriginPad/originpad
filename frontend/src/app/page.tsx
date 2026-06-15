import { redirect } from "next/navigation";

// The old intro/home is retired. The app opens straight on the NFT feed.
export default function Home() {
  redirect("/explore");
}
