import Sidebar from '@/app/components/Sidebar';

export default function Home() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">
            S
          </div>
          <h1 className="text-3xl font-semibold text-slate-900 mb-2">Scruotia</h1>
          <p className="text-slate-500">
            Selecciona un proyecto del sidebar o crea uno nuevo para empezar el outline de tu novela.
          </p>
        </div>
      </main>
    </div>
  );
}
