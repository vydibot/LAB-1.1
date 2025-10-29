/*
    script principal del simulador de gestión de memoria.
    implementa lógica para segmentación y paginación.
    (actualizado con modal de detalles y renderizado agrupado)
*/
document.addEventListener('DOMContentLoaded', () => {

    // --- constantes y estado global ---
    const memoria_total_bytes = 16 * 1024 * 1024; 
    const memoria_so_bytes = 1 * 1024 * 1024; 

    // estado principal
    let memoria = []; // para segmentación (lista de bloques)
    let marcos_de_pagina = []; // para paginación (array de marcos)
    let tamano_pagina_bytes = 65536; // 64 kib por defecto
    
    // contadores
    let contador_id_memoria = 1; // id interno para el gestor de memoria
    let contador_id_instancia = 1; // id para el contador de instancias (ej. word #1, word #2)

    // nuevas estructuras de datos
    let plantillas_procesos = []; // plantillas de programas disponibles
    let procesos_en_ejecucion = []; // instancias activas en memoria

    // --- referencias al dom (elementos de la interfaz) ---
    const contenedor_bloques_memoria = document.getElementById('memory-blocks');
    const contenedor_etiquetas_direccion = document.getElementById('address-labels');
    const tooltip = document.getElementById('tooltip');

    // controles
    const tecnica_select = document.getElementById('tecnica-memoria');
    const algoritmo_select = document.getElementById('algoritmo-ajuste');
    const reiniciar_btn = document.getElementById('reiniciar-btn');
    
    // contenedores de configuración
    const config_paginacion = document.getElementById('configuracion-paginacion');
    const input_tamano_pagina = document.getElementById('tamano-pagina');
    const config_segmentacion = document.getElementById('configuracion-segmentacion');

    // listas
    const programas_disponibles_list_ul = document.getElementById('programas-disponibles-list');
    const procesos_ejecucion_list_ul = document.getElementById('procesos-ejecucion-list');
    const tablas_paginas_container = document.getElementById('tablas-paginas-container');
    const tablas_paginas_content = document.getElementById('tablas-paginas-content');

    // formulario de proceso personalizado
    const agregar_proceso_btn = document.getElementById('agregar-proceso-btn');
    const nombre_personalizado_input = document.getElementById('nombre-personalizado');
    const inputs_segmentos = {
        text: document.getElementById('tamano-text'),
        data: document.getElementById('tamano-data'),
        bss: document.getElementById('tamano-bss'),
        stack: document.getElementById('tamano-stack'),
        heap: document.getElementById('tamano-heap')
    };
    
    // (*** ¡nuevo! ***) referencias al modal
    const modal = document.getElementById('process-modal');
    const modal_close_btn = document.getElementById('modal-close-btn');
    const modal_body = document.getElementById('modal-body');


    // --- clases y estructuras de datos ---
    
    class bloque {
        constructor(direccion, tamano, eslibre = true, proceso = null) {
            this.direccion = direccion; 
            this.tamano = tamano;       
            this.eslibre = eslibre;     
            // 'proceso' ahora contiene el color y el nombre de la instancia
            // ej: { id: 1, nombre: 'word #1', segmento: '.text', color: '#3498db' }
            this.proceso = proceso;     
        }
    }

    // --- funciones de utilidad ---

    const formatear_bytes = (bytes) => {
        if (bytes === 0) return '0 bytes';
        const k = 1024;
        const tamanos = ['bytes', 'kib', 'mib', 'gib'];
        const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + tamanos[i];
    };
    
    function formatear_direccion(direccion) {
        return '0x' + direccion.toString(16).toUpperCase().padStart(6, '0');
    }

    // nueva función para generar colores aleatorios brillantes
    function generar_color_aleatorio() {
        // usamos hsl para asegurar colores brillantes (saturación 70%, luminosidad 50-60%)
        const h = Math.floor(Math.random() * 360);
        const s = '70%';
        const l = `${Math.floor(Math.random() * 10) + 50}%`; // 50% a 59%
        return `hsl(${h}, ${s}, ${l})`;
    }
    
    // (*** ¡actualizado! ***)
    // función para cargar las plantillas iniciales (con tamaños intermedios)
    function cargar_plantillas_iniciales() {
        contador_id_memoria = 1;
        contador_id_instancia = 1;
        procesos_en_ejecucion = [];
        
        // tamaños reales (en bytes) tomados de generalidades.csv
        // .stack y .heap son fijos según el csv
        const stack_comun = 65536; // 64 kib
        const heap_comun = 131072; // 128 kib
        
        // (*** ¡actualizado! ***) multiplicador para que sean visibles
        const multiplicador = 6;
        
        plantillas_procesos = [
            { 
                nombre: 'p1 (notepad)', 
                segmentos: [
                    { nombre: '.text', tamano: 19524 * multiplicador },
                    { nombre: '.data', tamano: 12352 * multiplicador },
                    { nombre: '.bss', tamano: 1165 * multiplicador },
                    { nombre: '.stack', tamano: stack_comun }, // stack fijo
                    { nombre: '.heap', tamano: heap_comun * multiplicador }
                ]
                // total: ~1.3 mib
            },
            { 
                nombre: 'p2 (word)', 
                segmentos: [
                    { nombre: '.text', tamano: 77539 * multiplicador },
                    { nombre: '.data', tamano: 32680 * multiplicador },
                    { nombre: '.bss', tamano: 4100 * multiplicador },
                    { nombre: '.stack', tamano: stack_comun },
                    { nombre: '.heap', tamano: heap_comun * multiplicador }
                ]
                // total: ~1.8 mib
            },
            { 
                nombre: 'p3 (excel)', 
                segmentos: [
                    { nombre: '.text', tamano: 99542 * multiplicador },
                    { nombre: '.data', tamano: 24245 * multiplicador },
                    { nombre: '.bss', tamano: 7557 * multiplicador },
                    { nombre: '.stack', tamano: stack_comun },
                    { nombre: '.heap', tamano: heap_comun * multiplicador }
                ]
                // total: ~1.9 mib
            },
            { 
                nombre: 'p4 (powerpoint)', 
                segmentos: [
                    { nombre: '.text', tamano: 115000 * multiplicador },
                    { nombre: '.data', tamano: 123470 * multiplicador },
                    { nombre: '.bss', tamano: 1123 * multiplicador },
                    { nombre: '.stack', tamano: stack_comun },
                    { nombre: '.heap', tamano: heap_comun * multiplicador }
                ]
                // total: ~2.5 mib
            },
            { 
                nombre: 'p5 (publisher)', 
                segmentos: [
                    { nombre: '.text', tamano: 12342 * multiplicador },
                    { nombre: '.data', tamano: 1256 * multiplicador },
                    { nombre: '.bss', tamano: 1756 * multiplicador },
                    { nombre: '.stack', tamano: stack_comun },
                    { nombre: '.heap', tamano: heap_comun * multiplicador }
                ]
                // total: ~1.2 mib
            }
        ];
    }


    // --- lógica principal de la simulación ---

    function iniciar_simulacion() {
        console.log('iniciando simulación...');
        
        // reiniciar contadores y listas
        cargar_plantillas_iniciales();
        
        memoria = []; 
        marcos_de_pagina = [];

        const tecnica = tecnica_select.value;
        const bloque_so = new bloque(0, memoria_so_bytes, false, { id: 'so', nombre: 'sistema operativo', color: 'var(--os-color)' });

        if (tecnica === 'segmentacion') {
            memoria.push(bloque_so);
            memoria.push(new bloque(memoria_so_bytes, memoria_total_bytes - memoria_so_bytes));
            
        } else if (tecnica === 'paginacion') {
            memoria.push(bloque_so); 
            
            // (*** ¡actualizado! ***) validación de tamaño de página
            const tamano_pagina_kib = parseInt(input_tamano_pagina.value, 10) || 64;
            const minimo_tamano_kib = 32; // mínimo de 32 kib para que sea visible

            if (tamano_pagina_kib < minimo_tamano_kib) {
                // usamos alert() nativo porque el modal personalizado no está listo aquí
                alert(`El tamaño de página ${tamano_pagina_kib} KiB es demasiado pequeño para una visualización clara.\nSe usará el mínimo de ${minimo_tamano_kib} KiB.`);
                tamano_pagina_bytes = minimo_tamano_kib * 1024;
                input_tamano_pagina.value = minimo_tamano_kib; // actualizar el input
            } else {
                tamano_pagina_bytes = tamano_pagina_kib * 1024;
            }
            
            let direccion_actual = memoria_so_bytes;
            let marco_id = 0;
            const memoria_usable = memoria_total_bytes - memoria_so_bytes;
            let memoria_asignada_marcos = 0;
            
            while(memoria_asignada_marcos + tamano_pagina_bytes <= memoria_usable) {
                marcos_de_pagina.push({
                    id: marco_id,
                    direccion: direccion_actual,
                    tamano: tamano_pagina_bytes,
                    es_libre: true,
                    // info del proceso (se rellena al asignar)
                    id_proceso_memoria: null, 
                    nombre_instancia: null,
                    segmento: null,
                    numero_pagina: null,
                    color: null
                });
                direccion_actual += tamano_pagina_bytes;
                memoria_asignada_marcos += tamano_pagina_bytes;
                marco_id++;
            }
            
            const restante = memoria_usable - memoria_asignada_marcos;
            if(restante > 0) {
                 memoria.push(new bloque(direccion_actual, restante, false, {id: 'frag', nombre: 'fragmentación interna', color: 'var(--free-color)'}));
            }
        }

        renderizar_todo();
    }

    // --- lógica de asignación (segmentación) ---

    // (función reescrita y probada)
    function asignar_segmentos_proceso(instancia) {
        // 1. fase de verificación (simulación en una copia)
        let memoria_temporal = JSON.parse(JSON.stringify(memoria)); 
        for (const segmento of instancia.segmentos) {
            // (*** ¡actualizado! ***) ignorar segmentos de tamaño 0
            if (segmento.tamano === 0) continue; 
            
            const algoritmo = algoritmo_select.value;
            let mejor_hueco_idx = -1;

            for(let i=0; i < memoria_temporal.length; i++) {
                const hueco = memoria_temporal[i];
                if(hueco.eslibre && hueco.tamano >= segmento.tamano) {
                    if(algoritmo === 'first-fit') {
                        mejor_hueco_idx = i;
                        break; 
                    }
                    else if (algoritmo === 'best-fit') {
                        if (mejor_hueco_idx === -1 || hueco.tamano < memoria_temporal[mejor_hueco_idx].tamano) {
                            mejor_hueco_idx = i;
                        }
                    }
                    else if (algoritmo === 'worst-fit') {
                         if (mejor_hueco_idx === -1 || hueco.tamano > memoria_temporal[mejor_hueco_idx].tamano) {
                            mejor_hueco_idx = i;
                        }
                    }
                }
            }

            if (mejor_hueco_idx !== -1) {
                const hueco_encontrado = memoria_temporal[mejor_hueco_idx];
                const tamano_restante = hueco_encontrado.tamano - segmento.tamano;
                hueco_encontrado.tamano = segmento.tamano;
                hueco_encontrado.eslibre = false;
                if (tamano_restante > 0) {
                    memoria_temporal.splice(mejor_hueco_idx + 1, 0, {
                        direccion: hueco_encontrado.direccion + segmento.tamano,
                        tamano: tamano_restante,
                        eslibre: true,
                        proceso: null
                    });
                }
            } else {
                console.error(`[segmentación] fallo en verificación. no hay hueco para ${segmento.nombre}`);
                return false; // no se pudo asignar
            }
        }

        // 2. fase de asignación (real)
        console.log(`[segmentación] verificación exitosa para ${instancia.nombre_instancia}. asignando...`);
        
        for (const segmento of instancia.segmentos) {
            // (*** ¡actualizado! ***) ignorar segmentos de tamaño 0
            if (segmento.tamano === 0) continue;
            
            const algoritmo = algoritmo_select.value;
            let mejor_hueco_idx = -1;

            for(let i=0; i < memoria.length; i++) {
                const hueco = memoria[i];
                if(hueco.eslibre && hueco.tamano >= segmento.tamano) {
                    if(algoritmo === 'first-fit') {
                        mejor_hueco_idx = i;
                        break;
                    }
                    else if (algoritmo === 'best-fit') {
                        if (mejor_hueco_idx === -1 || hueco.tamano < memoria[mejor_hueco_idx].tamano) {
                            mejor_hueco_idx = i;
                        }
                    }
                    else if (algoritmo === 'worst-fit') {
                         if (mejor_hueco_idx === -1 || hueco.tamano > memoria[mejor_hueco_idx].tamano) {
                            mejor_hueco_idx = i;
                        }
                    }
                }
            }
            
            const hueco_real = memoria[mejor_hueco_idx];
            const tamano_restante = hueco_real.tamano - segmento.tamano;
            
            hueco_real.tamano = segmento.tamano;
            hueco_real.eslibre = false;
            // ¡importante! se asigna el color de la instancia
            hueco_real.proceso = {
                id: instancia.id_proceso_memoria,
                nombre: instancia.nombre_instancia,
                segmento: segmento.nombre,
                color: instancia.color 
            };

            if (tamano_restante > 0) {
                memoria.splice(mejor_hueco_idx + 1, 0, new bloque(
                    hueco_real.direccion + segmento.tamano,
                    tamano_restante
                ));
            }
        }
        return true; // éxito
    }

    function liberar_memoria_proceso_segmentacion(instancia) {
        if (!instancia.id_proceso_memoria) return;
        memoria.forEach(bloque => {
            if (bloque.proceso && bloque.proceso.id === instancia.id_proceso_memoria) {
                bloque.eslibre = true;
                bloque.proceso = null;
            }
        });
        fusionar_huecos_libres();
    }

    function fusionar_huecos_libres() {
        let i = 0;
        while (i < memoria.length - 1) {
            let actual = memoria[i];
            let siguiente = memoria[i+1];
            if (actual.eslibre && siguiente.eslibre) {
                actual.tamano += siguiente.tamano; 
                memoria.splice(i + 1, 1); 
            } else {
                i++; 
            }
        }
    }

    // --- lógica de asignación (paginación) ---
    
    function asignar_paginas_proceso(instancia) {
        console.log(`[paginación] asignando proceso: ${instancia.nombre_instancia}`);
        instancia.tabla_paginas = [];
        
        let paginas_necesarias_total = 0;
        let desglose_paginas = []; 

        for (const segmento of instancia.segmentos) {
            if (segmento.tamano === 0) continue;
            const paginas_necesarias = Math.ceil(segmento.tamano / tamano_pagina_bytes);
            paginas_necesarias_total += paginas_necesarias;
            desglose_paginas.push({ segmento, paginas_necesarias });
        }
        console.log(`[paginación] páginas necesarias: ${paginas_necesarias_total}`);

        const marcos_libres = marcos_de_pagina.filter(m => m.es_libre);
        console.log(`[paginación] marcos libres: ${marcos_libres.length}`);
        if (marcos_libres.length < paginas_necesarias_total) {
            console.error('[paginación] ¡fallo! no hay suficientes marcos libres.');
            return false;
        }

        let indice_marco_libre = 0;

        for (const item of desglose_paginas) {
            const segmento = item.segmento;
            for (let i = 0; i < item.paginas_necesarias; i++) {
                const marco = marcos_libres[indice_marco_libre];
                
                marco.es_libre = false;
                marco.id_proceso_memoria = instancia.id_proceso_memoria;
                marco.nombre_instancia = instancia.nombre_instancia;
                marco.segmento = segmento.nombre;
                marco.numero_pagina = i; 
                marco.color = instancia.color; // ¡importante! se asigna el color

                instancia.tabla_paginas.push({
                    segmento: segmento.nombre,
                    numero_pagina: i,
                    id_marco: marco.id
                });
                
                indice_marco_libre++;
            }
        }
        console.log(`[paginación] éxito. asignando ${paginas_necesarias_total} marcos.`);
        return true; // éxito
    }
    
    function liberar_paginas_proceso(instancia) {
        if (!instancia.id_proceso_memoria) return;
        console.log(`[paginación] liberando proceso: ${instancia.nombre_instancia}`);

        marcos_de_pagina.forEach(marco => {
            if (marco.id_proceso_memoria === instancia.id_proceso_memoria) {
                marco.es_libre = true;
                marco.id_proceso_memoria = null;
                marco.nombre_instancia = null;
                marco.segmento = null;
                marco.numero_pagina = null;
                marco.color = null;
            }
        });
        instancia.tabla_paginas = [];
    }

    // --- lógica de activación de procesos (nueva) ---

    // se llama al hacer clic en "agregar"
    function agregar_proceso_instancia(nombre_plantilla) {
        const plantilla = plantillas_procesos.find(p => p.nombre === nombre_plantilla);
        if (!plantilla) return;
        
        const tecnica = tecnica_select.value;
        
        // crear una nueva instancia (copia profunda)
        const instancia = JSON.parse(JSON.stringify(plantilla));
        instancia.id_instancia = contador_id_instancia;
        instancia.id_proceso_memoria = contador_id_memoria; // id para el gestor de memoria
        instancia.color = generar_color_aleatorio();
        
        // contar cuántas instancias de este tipo ya existen
        const conteo_existente = procesos_en_ejecucion.filter(p => p.nombre.startsWith(plantilla.nombre)).length;
        instancia.nombre_instancia = `${plantilla.nombre} #${conteo_existente + 1}`;
        
        let exito = false;
        if (tecnica === 'segmentacion') {
            exito = asignar_segmentos_proceso(instancia);
        } else {
            exito = asignar_paginas_proceso(instancia);
        }
        
        if (exito) {
            // solo si tiene éxito, se incrementan los contadores y se añade a la lista
            contador_id_instancia++;
            contador_id_memoria++;
            procesos_en_ejecucion.push(instancia);
        } else {
            alert(`no hay suficiente memoria para iniciar "${instancia.nombre_instancia}".`);
        }
        
        renderizar_todo();
    }

    // se llama al hacer clic en "eliminar"
    function eliminar_proceso_instancia(id_instancia) {
        const indice = procesos_en_ejecucion.findIndex(p => p.id_instancia === id_instancia);
        if (indice === -1) return;
        
        const instancia = procesos_en_ejecucion[indice];
        const tecnica = tecnica_select.value;

        if (tecnica === 'segmentacion') {
            liberar_memoria_proceso_segmentacion(instancia);
        } else {
            liberar_paginas_proceso(instancia);
        }
        
        // eliminar de la lista de procesos en ejecución
        procesos_en_ejecucion.splice(indice, 1);
        
        renderizar_todo();
    }


    // --- renderizado y ui ---

    function actualizar_controles_ui() {
        const tecnica = tecnica_select.value;
        config_paginacion.style.display = (tecnica === 'paginacion') ? 'block' : 'none';
        config_segmentacion.style.display = (tecnica === 'segmentacion') ? 'block' : 'none';
        tablas_paginas_container.style.display = (tecnica === 'paginacion') ? 'block' : 'none';
    }

    function renderizar_todo() {
        renderizar_memoria();
        renderizar_listas_procesos(); // nombre actualizado
        if (tecnica_select.value === 'paginacion') {
            renderizar_tablas_paginas();
        }
    }

    // (*** ¡lógica de renderizado actualizada! ***)
    function renderizar_memoria() {
        contenedor_bloques_memoria.innerHTML = '';
        contenedor_etiquetas_direccion.innerHTML = '';

        const tecnica = tecnica_select.value;
        
        const bloque_so = memoria[0];
        if (bloque_so) {
            renderizar_bloque_visual(bloque_so, 'so');
        }

        if (tecnica === 'segmentacion') {
            // (*** ¡nueva lógica de agrupación! ***)
            let i = 1; // saltar el so
            while (i < memoria.length) {
                const bloque_inicio = memoria[i];
                
                if (bloque_inicio.eslibre) {
                    // renderizar bloque libre simple
                    renderizar_bloque_visual(bloque_inicio, 'segmento_libre');
                    i++;
                    continue;
                }

                // si no es libre, es un proceso. agrupar todos los contiguos.
                const id_proceso = bloque_inicio.proceso.id;
                const instancia = procesos_en_ejecucion.find(p => p.id_proceso_memoria === id_proceso);
                
                // construir el objeto 'grupo'
                let grupo = {
                    id_proceso_memoria: id_proceso,
                    id_instancia: instancia ? instancia.id_instancia : null,
                    nombre_instancia: bloque_inicio.proceso.nombre,
                    color: bloque_inicio.proceso.color,
                    direccion: bloque_inicio.direccion,
                    tamano: bloque_inicio.tamano,
                    segmentos: [bloque_inicio] // guardar el bloque *completo*
                };

                // buscar más segmentos contiguos del mismo proceso
                let j = i + 1;
                while (j < memoria.length && 
                       !memoria[j].eslibre && 
                       memoria[j].proceso.id === id_proceso) {
                    
                    grupo.tamano += memoria[j].tamano;
                    grupo.segmentos.push(memoria[j]);
                    j++;
                }
                
                // renderizar el grupo completo como un solo bloque
                renderizar_bloque_visual(grupo, 'segmento_agrupado');
                
                // saltar al siguiente bloque no procesado
                i = j;
            }

        } else { // paginación
            marcos_de_pagina.forEach(marco => {
                renderizar_bloque_visual(marco, 'marco');
            });
            if (memoria.length > 1) {
                memoria.slice(1).forEach(fragmento => {
                     renderizar_bloque_visual(fragmento, 'fragmento');
                });
            }
        }
    }
    
    // (*** ¡función de renderizado de bloque actualizada! ***)
    function renderizar_bloque_visual(item, tipo) {
        const bloquediv = document.createElement('div');
        bloquediv.className = 'memory-block';

        const altura_porcentaje = (item.tamano / memoria_total_bytes) * 100;
        const top_porcentaje = (item.direccion / memoria_total_bytes) * 100;
        
        bloquediv.style.height = `${altura_porcentaje}%`;
        bloquediv.style.top = `${top_porcentaje}%`;

        // etiquetas de dirección
        const etiqueta_inicio = document.createElement('div');
        etiqueta_inicio.className = 'address-label start';
        etiqueta_inicio.textContent = formatear_direccion(item.direccion);
        etiqueta_inicio.style.top = `${top_porcentaje}%`;
        contenedor_etiquetas_direccion.appendChild(etiqueta_inicio);
        
        const direccion_fin = item.direccion + item.tamano;
        if (direccion_fin <= memoria_total_bytes) {
            const etiqueta_fin = document.createElement('div');
            etiqueta_fin.className = 'address-label end';
            etiqueta_fin.textContent = formatear_direccion(direccion_fin - 1);
            etiqueta_fin.style.top = `${top_porcentaje + altura_porcentaje}%`;
            contenedor_etiquetas_direccion.appendChild(etiqueta_fin);
        }

        let contenido_info = '';
        let contenido_tooltip = `
            <b>dirección inicio:</b> ${formatear_direccion(item.direccion)}<br>
            <b>dirección fin:</b> ${formatear_direccion(direccion_fin - 1)}<br>
            <b>tamaño:</b> ${formatear_bytes(item.tamano)}
        `;
        
        const infodiv = document.createElement('div');
        infodiv.className = 'block-info';

        if (tipo === 'so' || tipo === 'fragmento') {
            bloquediv.style.backgroundColor = item.proceso.color;
            if (tipo === 'fragmento') {
                bloquediv.style.filter = 'brightness(0.6)';
                contenido_info = `fragmentación<br>${formatear_bytes(item.tamano)}`;
                contenido_tooltip += `<br><b>estado:</b> fragmentación (no usable)`;
            } else {
                bloquediv.classList.add('block-os');
                contenido_info = `<b>${item.proceso.nombre}</b><br>${formatear_bytes(item.tamano)}`;
                contenido_tooltip += `<br><b>proceso:</b> ${item.proceso.nombre}`;
            }
            bloquediv.classList.add('show-info'); // mostrar texto para so y fragmento
        }
        else if (tipo === 'segmento_libre') {
            bloquediv.classList.add('segmento', 'block-free');
            contenido_info = `libre<br>${formatear_bytes(item.tamano)}`;
            contenido_tooltip += `<br><b>estado:</b> libre`;
            bloquediv.classList.add('show-info'); // mostrar texto para libre
        }
        else if (tipo === 'segmento_agrupado') {
            bloquediv.classList.add('segmento', 'block-process', 'show-info'); // <-- 'show-info' añadido
            bloquediv.style.backgroundColor = item.color; // color sólido
            
            contenido_info = `<b>${item.nombre_instancia}</b>`; // <-- nombre añadido
            
            contenido_tooltip += `<br><b>proceso:</b> ${item.nombre_instancia} (id:${item.id_proceso_memoria})`;
            contenido_tooltip += `<br><b>segmentos:</b> ${item.segmentos.length}`;
            contenido_tooltip += `<br><i>(clic para ver detalles)</i>`;
            
            // ¡acción de clic actualizada!
            bloquediv.onclick = () => mostrar_detalle_bloque(item, 'segmento');
        }
        else if (tipo === 'marco') {
             if (item.es_libre) {
                bloquediv.classList.add('block-free');
                // ocultamos el texto si el marco es muy pequeño
                if (tamano_pagina_bytes > 32768) {
                    contenido_info = `marco ${item.id} (libre)`;
                    bloquediv.classList.add('show-info');
                }
                contenido_tooltip += `<br><b>marco físico:</b> ${item.id}<br><b>estado:</b> libre`;
            } else {
                bloquediv.classList.add('block-process', 'show-info'); // <-- 'show-info' añadido
                bloquediv.style.backgroundColor = item.color; // color sólido

                // (*** ¡actualizado! ***) mostrar nombre e info de página
                if (item.tamano > 32768) { // si el marco es > 32kib
                     contenido_info = `<b>${item.nombre_instancia}</b><br>pág. ${item.numero_pagina}`;
                } else { // si es más pequeño, abreviar
                     contenido_info = `<b>${item.nombre_instancia.substring(0, 8)}...</b><br>p${item.numero_pagina}`;
                }

                contenido_tooltip += `<br><b>proceso:</b> ${item.nombre_instancia} (id:${item.id_proceso_memoria})`;
                contenido_tooltip += `<br><b>marco físico:</b> ${item.id}`;
                contenido_tooltip += `<br><b>segmento:</b> ${item.segmento}`;
                contenido_tooltip += `<br><b>página lógica:</b> ${item.numero_pagina}`;
                contenido_tooltip += `<br><i>(clic para ver detalles)</i>`;

                // ¡acción de clic actualizada!
                bloquediv.onclick = () => mostrar_detalle_bloque(item, 'marco');
            }
        }
        
        infodiv.innerHTML = contenido_info;
        bloquediv.appendChild(infodiv);
        
        bloquediv.addEventListener('mousemove', (e) => {
            tooltip.innerHTML = contenido_tooltip;
            tooltip.style.display = 'block';
            tooltip.style.left = `${e.pageX + 15}px`;
            tooltip.style.top = `${e.pageY + 15}px`;
        });
        bloquediv.addEventListener('mouseout', () => {
            tooltip.style.display = 'none';
        });

        contenedor_bloques_memoria.appendChild(bloquediv);
    }
    
    // (*** ¡nueva función! ***)
    // muestra el modal con los detalles del proceso
    function mostrar_detalle_bloque(item, tipo) {
        modal_body.innerHTML = ''; // limpiar modal
        let id_instancia_a_eliminar = null;
        let instancia_proceso = null; // para el botón de eliminar

        if (tipo === 'segmento') {
            // 'item' es el objeto 'grupo'
            id_instancia_a_eliminar = item.id_instancia;
            instancia_proceso = item; // usamos el 'grupo' para el nombre
            
            let html = `<h3 style="color:${item.color};">${item.nombre_instancia}</h3>`;
            html += `
                <p>
                    <span class="modal-color-swatch" style="background-color:${item.color};"></span>
                    <b>id memoria:</b> ${item.id_proceso_memoria} | 
                    <b>id instancia:</b> ${item.id_instancia}
                </p>
                <p>
                    <b>bloque contiguo:</b> ${formatear_direccion(item.direccion)} - ${formatear_direccion(item.direccion + item.tamano - 1)}
                </p>
                <p><b>tamaño total:</b> ${formatear_bytes(item.tamano)}</p>
                
                <h4>Segmentos Internos</h4>
                <table class="styled-table">
                    <thead>
                        <tr>
                            <th>segmento</th>
                            <th>dirección inicio</th>
                            <th>tamaño</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            item.segmentos.forEach(bloque_segmento => {
                html += `
                    <tr>
                        <td>${bloque_segmento.proceso.segmento}</td>
                        <td>${formatear_direccion(bloque_segmento.direccion)}</td>
                        <td>${formatear_bytes(bloque_segmento.tamano)}</td>
                    </tr>
                `;
            });
            
            html += '</tbody></table>';
            modal_body.innerHTML = html;

        } else if (tipo === 'marco') {
            // 'item' es el objeto 'marco'
            const instancia = procesos_en_ejecucion.find(p => p.id_proceso_memoria === item.id_proceso_memoria);
            if (!instancia) return; // no se encontró la instancia, no mostrar nada
            
            id_instancia_a_eliminar = instancia.id_instancia;
            instancia_proceso = instancia; // usamos la 'instancia' para el nombre
            
            let html = `<h3 style="color:${instancia.color};">${instancia.nombre_instancia}</h3>`;
             html += `
                <p>
                    <span class="modal-color-swatch" style="background-color:${instancia.color};"></span>
                    <b>id memoria:</b> ${instancia.id_proceso_memoria} | 
                    <b>id instancia:</b> ${instancia.id_instancia}
                </p>
                <p>
                    <b>marco seleccionado:</b> ${item.id} (${formatear_direccion(item.direccion)})<br>
                    <b>contenido:</b> ${item.segmento}, página lógica ${item.numero_pagina}
                </p>
                
                <h4>Tabla de Páginas (Completa)</h4>
                <table class="styled-table">
                    <thead>
                        <tr>
                            <th>segmento</th>
                            <th>página lógica</th>
                            <th>marco físico</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
             // ordenar y mostrar la tabla de páginas completa de la instancia
            instancia.tabla_paginas.sort((a, b) => {
                if (a.segmento < b.segmento) return -1;
                if (a.segmento > b.segmento) return 1;
                return a.numero_pagina - b.numero_pagina;
            });
            
            instancia.tabla_paginas.forEach(entrada => {
                // resaltar la fila del marco seleccionado
                const clase_resaltado = (entrada.id_marco === item.id) ? 'style="background-color:var(--secondary-color);"' : '';
                html += `
                    <tr ${clase_resaltado}>
                        <td>${entrada.segmento}</td>
                        <td>${entrada.numero_pagina}</td>
                        <td>${entrada.id_marco}</td>
                    </tr>
                `;
            });
            
            html += '</tbody></table>';
            modal_body.innerHTML = html;
        }

        // añadir botón de eliminar
        if (id_instancia_a_eliminar && instancia_proceso) {
            const boton_eliminar = document.createElement('button');
            boton_eliminar.textContent = 'Eliminar Proceso';
            boton_eliminar.style.backgroundColor = 'var(--danger-color)';
            boton_eliminar.onclick = () => {
                // (*** ¡actualizado! ***) usar confirm() nativo (es más simple y funcional)
                if (confirm(`¿deseas finalizar el proceso "${instancia_proceso.nombre_instancia}"?`)) {
                    eliminar_proceso_instancia(id_instancia_a_eliminar);
                    cerrar_modal();
                }
            };
            modal_body.appendChild(boton_eliminar);
        }

        modal.style.display = 'flex'; // mostrar el modal
    }
    
    // (*** ¡nueva función! ***)
    // cierra el modal
    function cerrar_modal() {
        modal.style.display = 'none';
    }


    // (función actualizada para renderizar ambas listas)
    function renderizar_listas_procesos() {
        programas_disponibles_list_ul.innerHTML = '';
        procesos_ejecucion_list_ul.innerHTML = '';
        
        // 1. renderizar lista de plantillas (programas disponibles)
        plantillas_procesos.forEach(plantilla => {
            const li = document.createElement('li');
            li.className = 'lista-programas'; // clase común
            const tamano_total = plantilla.segmentos.reduce((total, seg) => total + seg.tamano, 0);

            const infodiv = document.createElement('div');
            infodiv.className = 'process-info';
            infodiv.innerHTML = `
                <span class="name">${plantilla.nombre}</span>
                <span class="size">${formatear_bytes(tamano_total)}</span>
            `;
            
            const boton_agregar = document.createElement('button');
            boton_agregar.textContent = 'Agregar';
            boton_agregar.onclick = () => {
                agregar_proceso_instancia(plantilla.nombre);
            };
            
            li.appendChild(infodiv);
            li.appendChild(boton_agregar);
            programas_disponibles_list_ul.appendChild(li);
        });
        
        // 2. renderizar lista de instancias (procesos en ejecución)
        procesos_en_ejecucion.forEach(instancia => {
            const li = document.createElement('li');
            li.className = 'lista-programas'; // clase común
            const tamano_total = instancia.segmentos.reduce((total, seg) => total + seg.tamano, 0);

            const infodiv = document.createElement('div');
            infodiv.className = 'process-instance-info';
            
            // swatch de color
            const swatch = document.createElement('div');
            swatch.className = 'process-color-swatch';
            swatch.style.backgroundColor = instancia.color;
            
            const textdiv = document.createElement('div');
            textdiv.className = 'process-info';
            textdiv.innerHTML = `
                <span class="name">${instancia.nombre_instancia}</span>
                <span class="size">${formatear_bytes(tamano_total)}</span>
            `;
            
            infodiv.appendChild(swatch);
            infodiv.appendChild(textdiv);

            const boton_eliminar = document.createElement('button');
            boton_eliminar.textContent = 'Eliminar';
            boton_eliminar.onclick = () => {
                eliminar_proceso_instancia(instancia.id_instancia);
            };
            
            li.appendChild(infodiv);
            li.appendChild(boton_eliminar);
            procesos_ejecucion_list_ul.appendChild(li);
        });
    }
    
    function renderizar_tablas_paginas() {
        tablas_paginas_content.innerHTML = '';
        const procesos_activos = procesos_en_ejecucion.filter(p => p.tabla_paginas.length > 0);
        
        if (procesos_activos.length === 0) {
            tablas_paginas_content.innerHTML = '<p>no hay procesos activos con páginas asignadas.</p>';
            return;
        }
        
        procesos_activos.forEach(proceso => {
            const contenedor_tabla = document.createElement('div');
            // mostramos el nombre de la instancia y su color
            let html_tabla = `
                <h3 style="color:${proceso.color};">
                    ${proceso.nombre_instancia}
                </h3>`;
            html_tabla += `
                <table class="styled-table">
                    <thead>
                        <tr>
                            <th>segmento</th>
                            <th>página lógica</th>
                            <th>marco físico</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            proceso.tabla_paginas.sort((a, b) => {
                if (a.segmento < b.segmento) return -1;
                if (a.segmento > b.segmento) return 1;
                return a.numero_pagina - b.numero_pagina;
            });
            
            proceso.tabla_paginas.forEach(entrada => {
                html_tabla += `
                    <tr>
                        <td>${entrada.segmento}</td>
                        <td>${entrada.numero_pagina}</td>
                        <td>${entrada.id_marco}</td>
                    </tr>
                `;
            });
            
            html_tabla += '</tbody></table>';
            contenedor_tabla.innerHTML = html_tabla;
            tablas_paginas_content.appendChild(contenedor_tabla);
        });
    }


    // --- event listeners ---
    
    tecnica_select.addEventListener('change', () => {
        actualizar_controles_ui();
        iniciar_simulacion();
    });

    input_tamano_pagina.addEventListener('change', () => {
         if (tecnica_select.value === 'paginacion') {
            iniciar_simulacion();
         }
    });

    algoritmo_select.addEventListener('change', () => {
        console.log("algoritmo cambiado a: ", algoritmo_select.value);
    });

    reiniciar_btn.addEventListener('click', iniciar_simulacion);
    
    // (*** ¡nuevos! ***) listeners para el modal
    modal_close_btn.addEventListener('click', cerrar_modal);
    modal.addEventListener('click', (e) => {
        // cerrar si se hace clic en el fondo oscuro (overlay)
        if (e.target === modal) {
            cerrar_modal();
        }
    });
    
    agregar_proceso_btn.addEventListener('click', () => {
        const nombre = nombre_personalizado_input.value || `personalizado`;
        
        const segmentos = [
            { nombre: '.text', tamano: (parseInt(inputs_segmentos.text.value, 10) || 0) * 1024 },
            { nombre: '.data', tamano: (parseInt(inputs_segmentos.data.value, 10) || 0) * 1024 },
            { nombre: '.bss', tamano: (parseInt(inputs_segmentos.bss.value, 10) || 0) * 1024 },
            { nombre: '.stack', tamano: (parseInt(inputs_segmentos.stack.value, 10) || 0) * 1024 },
            { nombre: '.heap', tamano: (parseInt(inputs_segmentos.heap.value, 10) || 0) * 1024 }
        ].filter(s => s.tamano > 0); 

        if (segmentos.length === 0) {
            alert('el proceso debe tener al menos un segmento con tamaño mayor a 0.');
            return;
        }

        const nueva_plantilla = {
            nombre: nombre,
            segmentos: segmentos,
        };
        
        // añadirlo a la lista de plantillas
        plantillas_procesos.push(nueva_plantilla);
        
        // actualizar la lista en la ui
        renderizar_listas_procesos();
        
        // limpiar el formulario
        nombre_personalizado_input.value = '';
        Object.values(inputs_segmentos).forEach(input => input.value = '');
    });
    
    // --- inicialización ---
    
    actualizar_controles_ui();
    iniciar_simulacion(); // esto carga las plantillas iniciales

});

