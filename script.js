document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTES Y ESTADO GLOBAL ---
    const TOTAL_MEMORY_BYTES = 16 * 1024 * 1024; // 16 MiB
    const OS_MEMORY_BYTES = 2 * 1024 * 1024;   // 2 MiB
    const STACK_HEAP_OVERHEAD_BYTES = 64 * 1024; // 64 KiB para .stack y .heap

    let memory = null; // Estructura de datos principal para la memoria
    let processIdCounter = 1;
    let waitingQueue = [];
    
    // Referencias a elementos del DOM
    const memoryVisualization = document.getElementById('memory-visualization');
    const tooltip = document.getElementById('tooltip');
    const techniqueSelect = document.getElementById('memory-technique');
    const algorithmSelect = document.getElementById('fit-algorithm');
    const dynamicOptions = document.getElementById('dynamic-options');
    const compactBtn = document.getElementById('compact-btn');
    const resetBtn = document.getElementById('reset-btn');
    const addProcessBtn = document.getElementById('add-process-btn');
    const addPredefinedBtn = document.getElementById('add-predefined-btn');
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
    
    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KiB', 'MiB', 'GiB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // --- LÓGICA DE GESTIÓN DE MEMORIA ---
    
    function initializeMemory() {
        processIdCounter = 1;
        waitingQueue = [];
        const technique = techniqueSelect.value;
        
        dynamicOptions.style.display = technique === 'dynamic' ? 'block' : 'none';

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

            if (technique === 'static-fixed') {
                // Dividir en 7 particiones de 2 MiB cada una
                const partitionSize = 2 * 1024 * 1024;
                for (let i = 0; i < 7; i++) {
                    memory.push(new MemoryBlock(userMemoryStart + i * partitionSize, partitionSize));
                }
            } else { // 'static-variable'
                // Tamaños predefinidos: 1, 1, 2, 2, 3, 5 MiB
                const partitionSizes = [1, 1, 2, 2, 3, 5].map(s => s * 1024 * 1024);
                let currentAddress = userMemoryStart;
                partitionSizes.forEach(size => {
                    memory.push(new MemoryBlock(currentAddress, size));
                    currentAddress += size;
                });
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

    function addProcess(name, sizeInKiB) {
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
            processIdCounter++;
        } else {
            waitingQueue.push(process);
            alert(`No hay espacio suficiente para ${process.name} (${formatBytes(processSize)}). Añadido a la cola de espera.`);
        }
        render();
    }
    
    function allocateMemory(node, process) {
        const block = node.data;
        const technique = techniqueSelect.value;

        if (technique === 'dynamic') {
            const remainingSize = block.size - process.totalSize;
            
            // Si el espacio restante es suficientemente grande, se crea una nueva partición libre
            if (remainingSize > (16 * 1024)) { // Umbral de fragmentación interna: 16 KiB
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
                blockToFree.isFree = true;
                blockToFree.process = null;
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
            alert("La compactación solo está disponible para particionamiento dinámico y debe estar habilitada.");
            return;
        }
        
        let currentAddress = OS_MEMORY_BYTES;
        let totalFreeSize = 0;
        
        const newLinkedList = new DoublyLinkedList();
        newLinkedList.append(new MemoryBlock(0, OS_MEMORY_BYTES, false, { id: 'SO', name: 'Sistema Operativo', size: OS_MEMORY_BYTES }));

        // Mover todos los procesos al principio
        memory.forEach(node => {
            if (!node.data.isFree && node.data.process.id !== 'SO') {
                node.data.address = currentAddress;
                newLinkedList.append(node.data);
                currentAddress += node.data.size;
            } else if (node.data.isFree) {
                totalFreeSize += node.data.size;
            }
        });
        
        // Añadir un único bloque libre al final
        if (totalFreeSize > 0) {
            newLinkedList.append(new MemoryBlock(currentAddress, totalFreeSize));
        }

        memory = newLinkedList;
        render();
        alert("Compactación completada.");
    }

    // --- RENDERIZADO Y UI ---
    
    function render() {
        memoryVisualization.innerHTML = '';
        
        const iterable = (techniqueSelect.value === 'dynamic') ? memory.head : memory[0];
        
        const renderBlock = (block) => {
            const blockDiv = document.createElement('div');
            blockDiv.className = 'memory-block';
            
            const heightPercentage = (block.size / TOTAL_MEMORY_BYTES) * 100;
            const topPercentage = (block.address / TOTAL_MEMORY_BYTES) * 100;
            
            blockDiv.style.height = `${heightPercentage}%`;
            blockDiv.style.top = `${topPercentage}%`;
            
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

            // Tooltip
            blockDiv.addEventListener('mousemove', (e) => {
                let tooltipContent = `
                    <b>Dirección Inicio:</b> ${block.address} (${formatBytes(block.address)})<br>
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

            memoryVisualization.appendChild(blockDiv);
        };

        if (techniqueSelect.value === 'dynamic') {
            memory.forEach(node => renderBlock(node.data));
        } else {
            memory.forEach(block => renderBlock(block));
        }
        
        // Renderizar cola de espera
        waitingQueueUl.innerHTML = '';
        waitingQueue.forEach(proc => {
            const li = document.createElement('li');
            li.textContent = `${proc.name} - ${formatBytes(proc.totalSize)}`;
            waitingQueueUl.appendChild(li);
        });
    }

    // --- EVENT LISTENERS ---
    
    techniqueSelect.addEventListener('change', initializeMemory);
    resetBtn.addEventListener('click', initializeMemory);
    compactBtn.addEventListener('click', compactMemory);
    
    addProcessBtn.addEventListener('click', () => {
        const name = document.getElementById('process-name').value;
        const size = parseInt(document.getElementById('process-size').value, 10);
        addProcess(name, size);
        document.getElementById('process-name').value = '';
        document.getElementById('process-size').value = '';
    });

    addPredefinedBtn.addEventListener('click', () => {
        const predefinedProcesses = [
            { name: 'Navegador Web', size: 780 },
            { name: 'Editor de Código', size: 1200 },
            { name: 'Reproductor de Música', size: 450 },
            { name: 'Terminal', size: 256 },
            { name: 'Juego Ligero', size: 2100 }
        ];
        predefinedProcesses.forEach(p => addProcess(p.name, p.size));
    });
    
    // Inicializar la simulación al cargar la página
    initializeMemory();
});
