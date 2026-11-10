import {ConnectionNotice,PageHeader} from '../components/Primitives';
export function SummaryView(){
 return <div className="view-stack">
  <PageHeader eyebrow="Gestión" title="Centro de operaciones"
   description="Gestión de cocina, sala y catálogo del restaurante. Los datos económicos solo se muestran en Configuración a personal administrador autenticado."/>
  <ConnectionNotice title="Información financiera protegida.">
   Para consultar las cifras oficiales del restaurante se necesita sesión ADMIN y zona horaria configurada. Los importes se calculan en servidor y no se ofrecen cifras de demostración.
  </ConnectionNotice>
 </div>;
}
