// La configuración de Babel por defecto de Expo (`babel-preset-expo`, que también activa el compilador de
// React según app.json) más una regla propia: los iconos de lucide se importan uno a uno, para no cargar
// la librería entera (ver `babel/lucide-direct-imports.js`).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["./babel/lucide-direct-imports"],
  };
};
