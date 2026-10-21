import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

type Area='resumen'|'catalogo'|'mesas'|'comandas'|'equipo';
const sections:ReadonlyArray<{id:Area;label:string;detail:string}>= [
 {id:'resumen',label:'Resumen',detail:'Estado general de las operaciones'},
 {id:'catalogo',label:'Carta',detail:'Publicación y disponibilidad'},
 {id:'mesas',label:'Mesas y QR',detail:'Configuración y revocación de accesos'},
 {id:'comandas',label:'Comandas',detail:'Seguimiento de cocina y sala'},
 {id:'equipo',label:'Equipo',detail:'Roles y titularidad administrativa'}
];
const details:Record<Area,{title:string;description:string;requirements:readonly string[]}>={
 resumen:{title:'Centro de operaciones',description:'Vista estructural de Sabora. No hay datos operativos conectados ni sesión administrativa activa.',requirements:['Autenticación del personal','Autorización por rol y titularidad','Datos reales de operación']},
 catalogo:{title:'Gestión de la carta',description:'La publicación debe respetar el snapshot validado y los permisos del único ADMIN escritor.',requirements:['Sesión administrativa verificada','Permisos de publicación','Validación de precios y disponibilidad']},
 mesas:{title:'Mesas y códigos QR',description:'Los QR deberán estar asociados a Sabora y podrán revocarse o regenerarse de forma controlada.',requirements:['Registro de mesas','Revocación transaccional','Autorización por mesa']},
 comandas:{title:'Cocina y sala',description:'El seguimiento de pedidos exige identidad autorizada, estados válidos e historial auditable.',requirements:['Pedidos persistidos','Permisos de cocina y camarero','Notificaciones deduplicadas']},
 equipo:{title:'Personal y accesos',description:'ROOT único y varios ADMIN, con un solo ADMIN titular de escritura.',requirements:['Invitación y activación segura','Protección de ROOT','Transferencia auditada de titularidad']}
};
function App(){
 const [area,setArea]=useState<Area>('resumen');
 const active=details[area];
 return <div className="management-shell">
  <header className="management-header"><span className="eyebrow">SABORA · OPERACIONES</span><span className="status-pill">Modo de diseño · Sin acceso a datos</span></header>
  <main className="management-main">
   <div className="management-heading"><h1>Gestión del restaurante</h1><p>Espacio de trabajo para el equipo de Sabora.</p></div>
   <div className="notice" role="status"><strong>Acceso administrativo no habilitado.</strong> Esta interfaz es una maqueta funcional de navegación. No permite iniciar sesión, consultar datos privados ni realizar cambios. No introduzcas información real.</div>
   <div className="management-workspace">
    <nav className="management-nav" aria-label="Áreas de gestión">
     {sections.map(section=><button type="button" key={section.id} className={area===section.id?'management-tab active':'management-tab'} aria-current={area===section.id?'page':undefined} onClick={()=>setArea(section.id)}><strong>{section.label}</strong><small>{section.detail}</small></button>)}
    </nav>
    <section className="management-detail" aria-live="polite">
     <span className="eyebrow">ÁREA DE GESTIÓN · NO OPERATIVA</span>
     <h2>{active.title}</h2><p>{active.description}</p>
     <h3>Antes de habilitar esta área</h3>
     <ul>{active.requirements.map(item=><li key={item}>{item}</li>)}</ul>
     <p className="management-disclaimer">Los controles de escritura y los datos reales permanecerán bloqueados hasta validar autenticación, permisos y contratos del backend.</p>
    </section>
   </div>
  </main>
  <footer className="management-footer">SABORA · Una experiencia CartaViva</footer>
 </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
