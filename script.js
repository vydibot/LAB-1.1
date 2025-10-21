document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTES Y ESTADO GLOBAL ---
    const TOTAL_MEMORY_BYTES = 16 * 1024 * 1024; // 16 MiB
    const OS_MEMORY_BYTES = 2 * 1024 * 1024;   // 2 MiB
    const STACK_HEAP_OVERHEAD_BYTES = 64 * 1024; // 64 KiB para .stack y .heap

    let memory = null; // Estructura de datos principal para la memoria
    let processIdCounter = 1;
    let waitingQueue = [];
    let predefinedProcesses = [
        { name: 'Navegador Web', size: 780, active: false, processId: null },
        { name: 'Editor de Código', size: 1200, active: false, processId: null },
        { name: 'Reproductor de Música', size: 450, active: false, processId: null },
        { name: 'Terminal', size: 256, active: false, processId: null },
        { name: 'Juego Ligero', size: 2100, active: false, processId: null },
        { name: 'Base de Datos', size: 3072, active: false, processId: null },
        { name: 'Máquina Virtual', size: 4096, active: false, processId: null }
    ];
    
    // Referencias a elementos del DOM
    const memoryVisualization = document.getElementById('memory-visualization');
    const memoryBlocksContainer = document.getElementById('memory-blocks');
    const addressLabelsContainer = document.getElementById('address-labels');
    const tooltip = document.getElementById('tooltip');
    const techniqueSelect = document.getElementById('memory-technique');
    const algorithmSelect = document.getElementById('fit-algorithm');
    const staticOptions = document.getElementById('static-options');
    const staticFixedConfig = document.getElementById('static-fixed-config');
    const staticVariableConfig = document.getElementById('static-variable-config');
    const dynamicOptions = document.getElementById('dynamic-options');
    const resetBtn = document.getElementById('reset-btn');
    const addProcessBtn = document.getElementById('add-process-btn');
    const processListUl = document.getElementById('process-list');
    const waitingQueueUl = document.getElementById('waiting-queue');

    // --- CLASES Y ESTRUCTURAS DE DATOS ---
    
    // Representa un bloque de memoria
    class MemoryBlock {
        constructor(address, size, isFree = true, process = null) {
            this.address = address;
            this.size = size;
            this.isFree = isFree;
            this.process = process; // { id, name, size }
        }
    }
    
    // Nodo para la lista enlazada (Particionamiento Dinámico)
    class Node {
        constructor(block) {
            this.data = block;
            this.next = null;
            this.prev = null;
        }
    }

    // Lista Doblemente Enlazada para gestionar la memoria dinámica
    class DoublyLinkedList {
        constructor() {
            this.head = null;
            this.tail = null;
        }

        append(block) {
            const newNode = new Node(block);
            if (!this.head) {
                this.head = newNode;
                this.tail = newNode;
            } else {
                this.tail.next = newNode;
                newNode.prev = this.tail;
                this.tail = newNode;
            }
        }
        
        //Organizacion de nodos 
        removeNode(node) {
            if (node.prev) node.prev.next = node.next;
            else this.head = node.next;

            if (node.next) node.next.prev = node.prev;
            else this.tail = node.prev;
        }
        
        // Itera sobre la lista
        forEach(callback) {
            let current = this.head;
            while (current) {
                callback(current);
                current = current.next;
            }
        }
    }

    // --- FUNCIONES DE UTILIDAD ---

    // Formatea bytes a una representación legible
    const formatBytes = (bytes) => {
        if (bytes === 0) 
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KiB', 'MiB', 'GiB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    function formatAddress(address) {
    return '0x' + address.toString(16).toUpperCase().padStart(8, '0');
}

    // --- LÓGICA DE GESTIÓN DE MEMORIA ---
    
    function initializeMemory() {
        processIdCounter = 1;
        waitingQueue = [];
        predefinedProcesses.forEach(p => {
            p.active = false;
            p.processId = null;
        });

        const technique = techniqueSelect.value;
        //Muestra la compactación solo si es dinámica
        dynamicOptions.style.display = technique === 'dynamic' ? 'block' : 'none';
        staticOptions.style.display = technique.startsWith('static') ? 'block' : 'none';
        staticFixedConfig.style.display = technique === 'static-fixed' ? 'block' : 'none';
        staticVariableConfig.style.display = technique === 'static-variable' ? 'block' : 'none';


        // Partición fija para el Sistema Operativo
        const osBlock = new MemoryBlock(0, OS_MEMORY_BYTES, false, { id: 'SO', name: 'Sistema Operativo', size: OS_MEMORY_BYTES });

        if (technique === 'dynamic') {
            memory = new DoublyLinkedList();
            memory.append(osBlock);
            const userMemorySize = TOTAL_MEMORY_BYTES - OS_MEMORY_BYTES;
            memory.append(new MemoryBlock(OS_MEMORY_BYTES, userMemorySize));
        } else { // Estática (fija o variable)
            memory = [];
            memory.push(osBlock);
            const userMemoryStart = OS_MEMORY_BYTES;
            const userMemorySize = TOTAL_MEMORY_BYTES - OS_MEMORY_BYTES;
            let currentAddress = userMemoryStart;

            if (technique === 'static-fixed') {
                const partitionSizeMiB = parseInt(document.getElementById('fixed-partition-size').value, 10) || 2;
                const partitionSize = partitionSizeMiB * 1024 * 1024;

                if (userMemorySize % partitionSize !== 0) {
                    alert(`Error: El tamaño de partición (${partitionSizeMiB} MiB) no divide el espacio de usuario disponible (${formatBytes(userMemorySize)}) de forma exacta. Por favor, elija un tamaño que sea divisor de ${userMemorySize / (1024*1024)} MiB.`);
                    render(); // Renderiza el estado actual (solo SO)
                    return;
                }

                let allocated = 0;
                while (allocated < userMemorySize) {
                    memory.push(new MemoryBlock(currentAddress, partitionSize));
                    currentAddress += partitionSize;
                    allocated += partitionSize;
                }
            } else { // 'static-variable'
                const sizesStr = document.getElementById('variable-partition-sizes').value;
                const partitionSizes = sizesStr.split(',')
                    .map(s => parseInt(s.trim(), 10))
                    .filter(s => !isNaN(s) && s > 0)
                    .map(s => s * 1024 * 1024);
                
                let totalPartitionedSize = 0;
                partitionSizes.forEach(size => {
                    if (totalPartitionedSize + size <= userMemorySize) {
                        memory.push(new MemoryBlock(currentAddress, size));
                        currentAddress += size;
                        totalPartitionedSize += size;
                    }
                });

                // Si después de crear las particiones definidas queda espacio, añadirlo como una partición libre.
                const remainingSize = userMemorySize - totalPartitionedSize;
                if (remainingSize > 0) {
                    memory.push(new MemoryBlock(currentAddress, remainingSize));
                }
            }
        }
        render();
    }

    // --- ALGORITMOS DE AJUSTE (FIT) ---

    function findFreeBlock(processSize) {
        const algorithm = algorithmSelect.value;
        const technique = techniqueSelect.value;
        let candidate = null;
        
        const getIterable = () => {
            if (technique === 'dynamic') {
                const arr = [];
                memory.forEach(node => arr.push(node));
                return arr;
            }
            return memory.map(block => ({ data: block })); // Simula la estructura del nodo
        };

        const blocks = getIterable();

        if (algorithm === 'first-fit') {
            for (const node of blocks) {
                if (node.data.isFree && node.data.size >= processSize) {
                    return node;
                }
            }
        } else if (algorithm === 'best-fit') {
            let bestNode = null;
            for (const node of blocks) {
                if (node.data.isFree && node.data.size >= processSize) {
                    if (!bestNode || node.data.size < bestNode.data.size) {
                        bestNode = node;
                    }
                }
            }
            return bestNode;
        } else if (algorithm === 'worst-fit') {
            let worstNode = null;
            for (const node of blocks) {
                if (node.data.isFree && node.data.size >= processSize) {
                    if (!worstNode || node.data.size > worstNode.data.size) {
                        worstNode = node;
                    }
                }
            }
            return worstNode;
        }
        return null;
    }

    // --- LÓGICA DE PROCESOS ---

    function addProcess(name, sizeInKiB, isPredefined = false, predefinedProcRef = null) {
        if (!sizeInKiB || sizeInKiB <= 0) {
            alert('Por favor, introduce un tamaño de proceso válido.');
            return;
        }

        const processSize = sizeInKiB * 1024 + STACK_HEAP_OVERHEAD_BYTES;
        const process = {
            id: processIdCounter,
            name: name || `Proceso ${processIdCounter}`,
            requestedSize: sizeInKiB * 1024,
            totalSize: processSize
        };

        const targetNode = findFreeBlock(processSize);

        if (targetNode) {
            allocateMemory(targetNode, process);
            if (isPredefined) {
                predefinedProcRef.processId = process.id;
            }
            processIdCounter++;
        } else {
            if (isPredefined) {
                predefinedProcRef.active = false; // No se pudo alocar, revertir estado
                alert(`No hay espacio para ${process.name}. Inténtalo más tarde.`);
            } else {
                waitingQueue.push(process);
                alert(`No hay espacio suficiente para ${process.name} (${formatBytes(processSize)}). Añadido a la cola de espera.`);
            }
        }
        render();
    }
     
    function allocateMemory(node, process) {
        const block = node.data;
        const technique = techniqueSelect.value;

        if (technique === 'dynamic') {
            const remainingSize = block.size - process.totalSize;
            
            // Si el espacio restante es suficientemente grande, se crea una nueva partición libre
            if (remainingSize >= 0) {
                block.size = process.totalSize;
                block.isFree = false;
                block.process = process;

                const newFreeBlock = new MemoryBlock(block.address + block.size, remainingSize);
                const newNode = new Node(newFreeBlock);

                // Insertar el nuevo nodo en la lista
                newNode.next = node.next;
                if (node.next) node.next.prev = newNode;
                else memory.tail = newNode;
                
                node.next = newNode;
                newNode.prev = node;
            } else { // Si no, se asigna el bloque completo para evitar fragmentación pequeña
                block.isFree = false;
                block.process = process;
            }
        } else { // Estática
            block.isFree = false;
            block.process = process;
        }
    }
    
    function freeMemory(blockAddress) {
        const technique = techniqueSelect.value;
        let nodeToFree = null;
        let freed = false;
        let freedProcessId = null;

        if (technique === 'dynamic') {
            let current = memory.head;
            while(current) {
                if(current.data.address === blockAddress) {
                    nodeToFree = current;
                    break;
                }
                current = current.next;
            }

            if (nodeToFree && !nodeToFree.data.isFree) {
                freed = true;
                freedProcessId = nodeToFree.data.process.id;
                nodeToFree.data.isFree = true;
                nodeToFree.data.process = null;
                
                // Fusionar con el bloque siguiente si es libre
                const nextNode = nodeToFree.next;
                if (nextNode && nextNode.data.isFree) {
                    nodeToFree.data.size += nextNode.data.size;
                    memory.removeNode(nextNode);
                }

                // Fusionar con el bloque anterior si es libre
                const prevNode = nodeToFree.prev;
                if (prevNode && prevNode.data.isFree) {
                    prevNode.data.size += nodeToFree.data.size;
                    memory.removeNode(nodeToFree);
                }
            }
        } else { // Estática
            const blockToFree = memory.find(b => b.address === blockAddress);
            if (blockToFree) {
                freed = true;
                freedProcessId = blockToFree.process.id;
                blockToFree.isFree = true;
                blockToFree.process = null;
            }
        }
        
        if (freed) {
            // Desactivar en la lista de predefinidos si corresponde
            const predefined = predefinedProcesses.find(p => p.processId === freedProcessId);
            if (predefined) {
                predefined.active = false;
                predefined.processId = null;
            }

            if (technique === 'dynamic' && document.getElementById('compaction-enabled').checked) {
                compactMemory();
            }
        }


        // Intentar alocar procesos en espera
        checkWaitingQueue();
        render();
    }
    
    function checkWaitingQueue() {
        const stillWaiting = [];
        for (const process of waitingQueue) {
            const targetNode = findFreeBlock(process.totalSize);
            if (targetNode) {
                allocateMemory(targetNode, process);
            } else {
                stillWaiting.push(process);
            }
        }
        waitingQueue = stillWaiting;
    }

    function compactMemory() {
        if (techniqueSelect.value !== 'dynamic' || !document.getElementById('compaction-enabled').checked) {
            return;
        }
    
        let writeNode = memory.head.next; // Empezar después del SO
        let scanNode = memory.head.next;
        let currentAddress = OS_MEMORY_BYTES;
    
        // 1. Mover todos los bloques ocupados al principio
        while (scanNode) {
            if (!scanNode.data.isFree) {
                // Si el bloque de escaneo está ocupado y no es el mismo que el de escritura
                if (scanNode !== writeNode) {
                    // Intercambiar los datos entre el nodo de escritura (libre) y el de escaneo (ocupado)
                    const temp = writeNode.data;
                    writeNode.data = scanNode.data;
                    scanNode.data = temp;
                }
                // Actualizar la dirección del bloque que ahora está en la posición de escritura
                writeNode.data.address = currentAddress;
                currentAddress += writeNode.data.size;
                
                // Avanzar el puntero de escritura al siguiente nodo
                writeNode = writeNode.next;
            }
            // Avanzar siempre el puntero de escaneo
            scanNode = scanNode.next;
        }
    
        // 2. Fusionar todos los bloques libres restantes en uno solo
        let firstFree = writeNode;
        if (!firstFree) return; // No hay espacio libre para fusionar
    
        let totalFreeSize = 0;
        let currentNode = firstFree;
        while (currentNode) {
            totalFreeSize += currentNode.data.size;
            const next = currentNode.next;
            if (currentNode !== firstFree) {
                memory.removeNode(currentNode); // Eliminar nodos libres redundantes
            }
            currentNode = next;
        }
    
        // Actualizar el primer bloque libre con el tamaño total
        firstFree.data.isFree = true;
        firstFree.data.process = null;
        firstFree.data.size = totalFreeSize;
        firstFree.data.address = currentAddress;
    }

    // --- RENDERIZADO Y UI ---
    
    function render() {
        memoryBlocksContainer.innerHTML = '';
        addressLabelsContainer.innerHTML = '';
        
        const iterable = (techniqueSelect.value === 'dynamic') ? memory.head : memory[0];
        
        const renderBlock = (block) => {
            const blockDiv = document.createElement('div');
            blockDiv.className = 'memory-block';
            
            const heightPercentage = (block.size / TOTAL_MEMORY_BYTES) * 100;
            const topPercentage = (block.address / TOTAL_MEMORY_BYTES) * 100;
            
            blockDiv.style.height = `${heightPercentage}%`;
            blockDiv.style.top = `${topPercentage}%`;

            // Renderizar etiquetas de dirección
            const startAddrLabel = document.createElement('div');
            startAddrLabel.className = 'address-label start';
            startAddrLabel.textContent = formatAddress(block.address);
            startAddrLabel.style.top = `${topPercentage}%`;
            addressLabelsContainer.appendChild(startAddrLabel);

            // Etiqueta de fin de bloque
            if (topPercentage + heightPercentage < 100.1) { // Usar < 100.1 para evitar errores de punto flotante
                const endAddrLabel = document.createElement('div');
                endAddrLabel.className = 'address-label end';
                endAddrLabel.textContent = formatAddress(block.address + block.size - 1);
                endAddrLabel.style.top = `${topPercentage + heightPercentage}%`;
                addressLabelsContainer.appendChild(endAddrLabel);
            }
            
            let content = '';
            if (block.process) { // Bloque ocupado (SO o proceso)
                blockDiv.classList.add(block.process.id === 'SO' ? 'block-os' : 'block-process');
                content = `<b>${block.process.name}</b><br>${formatBytes(block.size)}`;
                if (block.process.id !== 'SO') {
                    blockDiv.onclick = () => {
                        if (confirm(`¿Deseas finalizar el proceso "${block.process.name}" y liberar su memoria?`)) {
                            freeMemory(block.address);
                        }
                    };
                }
            } else { // Bloque libre
                blockDiv.classList.add('block-free');
                content = `Libre<br>${formatBytes(block.size)}`;
            }

            const infoDiv = document.createElement('div');
            infoDiv.className = 'block-info';
            infoDiv.innerHTML = content;
            blockDiv.appendChild(infoDiv);

            // Visualización de fragmentación interna para particionamiento estático
            if (techniqueSelect.value.startsWith('static') && block.process && block.process.id !== 'SO') {
                const internalFrag = block.size - block.process.totalSize;
                if (internalFrag > 0) {
                    const fragDiv = document.createElement('div');
                    fragDiv.className = 'internal-fragmentation';
                    const fragHeight = (internalFrag / block.size) * 100;
                    fragDiv.style.height = `${fragHeight}%`;
                    blockDiv.appendChild(fragDiv);
                }
            }

            // Tooltip
            blockDiv.addEventListener('mousemove', (e) => {
                let tooltipContent = `
                    <b>Dirección Inicio:</b> ${formatAddress(block.address)}<br>
                    <b>Tamaño:</b> ${formatBytes(block.size)}
                `;
                if (block.process) {
                    tooltipContent += `<br><b>Proceso:</b> ${block.process.name}`;
                    if(block.process.requestedSize) {
                        let internalFrag = block.size - block.process.totalSize;
                        tooltipContent += `<br><b>Tamaño Solicitado:</b> ${formatBytes(block.process.requestedSize)}`;
                        tooltipContent += `<br><b>Overhead (.stack/.heap):</b> ${formatBytes(STACK_HEAP_OVERHEAD_BYTES)}`;
                        tooltipContent += `<br><b>Total Usado:</b> ${formatBytes(block.process.totalSize)}`;
                        if (techniqueSelect.value.startsWith('static')) {
                           tooltipContent += `<br><b>Fragmentación Interna:</b> ${formatBytes(internalFrag)}`;
                        }
                    }
                } else {
                     tooltipContent += `<br><b>Estado:</b> Libre`;
                }
                
                tooltip.innerHTML = tooltipContent;
                tooltip.style.display = 'block';
                tooltip.style.left = `${e.pageX + 15}px`;
                tooltip.style.top = `${e.pageY + 15}px`;
            });
            blockDiv.addEventListener('mouseout', () => {
                tooltip.style.display = 'none';
            });

            memoryBlocksContainer.appendChild(blockDiv);
        };

        if (techniqueSelect.value === 'dynamic') {
            memory.forEach(node => renderBlock(node.data));
        } else {
            memory.forEach(block => renderBlock(block));
        }
        
        renderProcessList();
        renderWaitingQueue();
    }

    function renderProcessList() {
        processListUl.innerHTML = '';
        predefinedProcesses.forEach(proc => {
            const li = document.createElement('li');
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'process-info';
            infoDiv.innerHTML = `
                <span class="name">${proc.name}</span>
                <span class="size">${proc.size} KiB</span>
            `;

            const switchLabel = document.createElement('label');
            switchLabel.className = 'switch';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = proc.active;
            checkbox.addEventListener('change', () => {
                togglePredefinedProcess(proc.name, checkbox.checked);
            });

            const sliderSpan = document.createElement('span');
            sliderSpan.className = 'slider';

            switchLabel.appendChild(checkbox);
            switchLabel.appendChild(sliderSpan);
            
            li.appendChild(infoDiv);
            li.appendChild(switchLabel);
            processListUl.appendChild(li);
        });
    }

    function renderWaitingQueue() {
        waitingQueueUl.innerHTML = '';
        waitingQueue.forEach(proc => {
            const li = document.createElement('li');
            li.textContent = `${proc.name} - ${formatBytes(proc.totalSize)}`;
            waitingQueueUl.appendChild(li);
        });
    }

    function togglePredefinedProcess(processName, isActive) {
        const proc = predefinedProcesses.find(p => p.name === processName);
        if (!proc) return;

        proc.active = isActive;

        if (isActive) {
            addProcess(proc.name, proc.size, true, proc);
        } else {
            if (proc.processId !== null) {
                let blockToFree = null;
                const findBlock = (b) => {
                    if (b.process && b.process.id === proc.processId) {
                        blockToFree = b;
                    }
                };

                if (techniqueSelect.value === 'dynamic') {
                    memory.forEach(node => findBlock(node.data));
                } else {
                    memory.forEach(findBlock);
                }

                if (blockToFree) {
                    freeMemory(blockToFree.address);
                }
            }
        }
    }

    // --- EVENT LISTENERS ---
    
    techniqueSelect.addEventListener('change', initializeMemory);
    resetBtn.addEventListener('click', initializeMemory);
    
    addProcessBtn.addEventListener('click', () => {
        const name = document.getElementById('process-name').value;
        const size = parseInt(document.getElementById('process-size').value, 10);
        addProcess(name, size);
        document.getElementById('process-name').value = '';
        document.getElementById('process-size').value = '';
    });
    
    // Inicializar la simulación al cargar la página
    initializeMemory();
});
