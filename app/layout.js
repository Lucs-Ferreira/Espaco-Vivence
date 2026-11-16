import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../styles/globals.css';

export const metadata = {
  title: 'Espaço Vivence — Gestão de Locações',
  description: 'Locação de espaços para eventos e brinquedos infantis',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}