import { Redirect } from "expo-router";
import { Loading } from "@/components/screen";
import { isOnboarded } from "@/data/profile";
import { useQuery } from "@/data/provider";
import { Presentation } from "@/features/presentation/Presentation";
import { isWeb } from "@/lib/web";

/**
 * Punto de entrada: con datos, el inicio. Sin datos, en la web la presentación de IKYNDO (que lleva al
 * cuestionario) y en el móvil directamente el cuestionario.
 */
export default function Index() {
  const { data, error, reload } = useQuery(isOnboarded);
  if (data === undefined) return <Loading error={error} onRetry={reload} />;
  if (data) return <Redirect href="/inicio" />;
  return isWeb ? <Presentation /> : <Redirect href="/bienvenida" />;
}
