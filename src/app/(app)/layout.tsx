import { Sidebar } from "@/components/sidebar";
import { SidebarUser } from "@/components/sidebar-user";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen w-full">
      <Sidebar userSlot={<SidebarUser />} />
      <main className="flex h-screen flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
