import { Redirect } from "expo-router";
import { Loading } from "@/components/screen";
import { isOnboarded } from "@/data/profile";
import { useQuery } from "@/data/provider";

/** Punto de entrada: cuestionario si es la primera vez; si no, el inicio. */
export default function Index() {
  const { data, error, reload } = useQuery(isOnboarded);
  if (data === undefined) return <Loading error={error} onRetry={reload} />;
  return <Redirect href={data ? "/inicio" : "/bienvenida"} />;
}
