# E4C: Manual de Operación y Pruebas
> **Guía del Usuario y Desarrollador para el Pasaporte Estudiantil Digital y la Consola de APIs**

Este manual describe el funcionamiento, la arquitectura y las instrucciones de uso para el panel visual de **E4C (Education for Culture)** desplegado en Vercel.

---

## 1. Pasaporte Estudiantil Digital 3D (Interfaz Visual)
El pasaporte está diseñado como una credencial inteligente interactiva en 3D que representa la identidad y los méritos académicos del estudiante en la red Stellar.

### 1.1 Medidas de Seguridad Gráficas
Para simular un documento oficial físico de alta seguridad, la credencial incorpora:
* **Chip Dorado de Seguridad (Smart Chip):** Ubicado en la esquina superior derecha del anverso.
* **Marca de Agua (Watermark):** Un sello institucional difuso (`E4C SECURITY SEAL`) grabado en el fondo del pasaporte.
* **Laminado Holográfico:** Un adhesivo reflectante brillante en la esquina inferior derecha de la foto del estudiante que cambia de tonalidad con el ángulo de visión.
* **Código de Barras:** Ubicado en el pie del documento al lado del código MRZ (Machine Readable Zone).

### 1.2 Control de Enmascaramiento y Privacidad (Show/Hide)
Todos los caracteres de los datos sensibles cargan 100% ocultos de forma predeterminada (representados únicamente por círculos `●●●●`) para proteger por completo la privacidad. Se pueden revelar individualmente presionando el ícono de ojo (👁️):
* **Apellidos y Nombres:** Gomez Pablo Sebastián (Oculto/Visible).
* **Nro. Documento / DNI:** 42.671.789 (Oculto/Visible).
* **Curso / Clase:** 1ro 3ra (Oculto/Visible).
* **Dirección Stellar Wallet:** La clave pública completa (`GB2Z4633MOCKSTUDENTWALLETADDRESSXYZ77777`).

### 1.3 Interacción de Giro (Sellos de Visa)
Haciendo clic sobre cualquier parte del pasaporte (fuera de los íconos de ojo) o presionando el botón **"Girar Pasaporte"**, la credencial dará una vuelta tridimensional revelando el reverso:
* **Logros Certificados (Visas):** Representados como sellos circulares de tinta de pasaporte con efectos de desgaste y rotaciones realistas:
  * **Asistencia Perfecta** (Escudo cian y verde).
  * **Mejor Alumno** (Emblema de estrella de oro).
  * **Matemáticas (8.99)** (Fórmula y compás naranja).

---

## 2. Consola de Canjes & Transacciones Ledger
Ubicado dentro del panel técnico, registra cronológicamente las transacciones certificadas en la red Stellar Testnet.

### 2.1 Timeline de Eventos & Estadísticas
Muestra un panel informativo con el Total Desembolsado, el Ledger Height de la red y el estado en vivo de Testnet, seguido del historial de desafíos escolares completados:
1. **Asistencia Perfecta** (28 Jun 2026, 10:14 AM) • +150 Puntos de Reputación.
2. **Mejor Alumno** (29 Jun 2026, 02:32 PM) • +250 Puntos de Reputación.
3. **Desempeño en Matemáticas** (30 Jun 2026, 11:05 AM) • +200 Puntos de Reputación.

### 2.2 Auditoría de Firmas Stellar
Cada transacción tiene un botón de alternancia interactivo que dice **"Mostrar detalles"**. Al hacer clic en él, cambia dinámicamente a **"Ocultar detalles"** y despliega el bloque de detalles de la invocación en Soroban:
* **Ledger Block:** El bloque específico de Stellar en el que se validó la transacción.
* **Contrato Inteligente:** La dirección del contrato `partner_escrow` en Testnet.
* **Función Invocada:** `add_student_challenge(student, challenge_id, boost)`.
* **Argumentos (Args):** Valores exactos serializados de la billetera del alumno, ID del desafío y puntaje.
* **Autoridad Firmante:** La clave pública del administrador de E4C que firmó la operación.
* **Costo de Transacción (Fees):** Especificado en Stroops (la menor unidad de XLM).
* **Estado:** `SUCCESS`.

---

## 3. Consola de Desarrollo Serverless (API Explorer)
Permite realizar peticiones manuales a los endpoints serverless de Vercel y observar las respuestas JSON en tiempo real.

### 3.1 Endpoints Disponibles

#### A. Consultar Pasaporte (`GET /api/passport`)
* **Uso:** Obtiene el estado de la reputación y los desafíos completados de un estudiante en la blockchain.
* **Parámetros:** `studentWallet` (query param).
* **Ejemplo de Respuesta (200 OK):**
  ```json
  {
    "reputation": 600,
    "challenges": [401, 402, 403]
  }
  ```

#### B. Ejecutar Desembolso Seguro (`POST /api/disbursement`)
* **Uso:** Inicia la liquidación de USDC desde el contrato de depósito hacia el partner cultural (ej. Cine) usando firmas seguras delegadas (KMS) y secuencia asíncrona para evitar timeouts en Vercel.
* **Cuerpo (JSON):**
  ```json
  {
    "studentWallet": "GB2Z4633MOCKSTUDENTWALLETADDRESSXYZ77777",
    "partnerId": 101,
    "amount": "10000000"
  }
  ```
* **Cabecera de Autorización:** `Authorization: Bearer <API_SECRET_TOKEN>`.

#### C. Registrar Desafío / Logro (`POST /api/challenge`)
* **Uso:** Certifica en Soroban que un estudiante ha superado un desafío académico y le otorga reputación.
* **Cuerpo (JSON):**
  ```json
  {
    "studentWallet": "GB2Z4633MOCKSTUDENTWALLETADDRESSXYZ77777",
    "challengeId": 401,
    "reputationBoost": 150
  }
  ```

#### D. Actualizar Reputación Directa (`POST /api/reputation`)
* **Uso:** Permite al administrador ajustar o fijar directamente la reputación del alumno en la blockchain.
* **Cuerpo (JSON):**
  ```json
  {
    "studentWallet": "GB2Z4633MOCKSTUDENTWALLETADDRESSXYZ77777",
    "reputation": 500
  }
  ```

#### E. Procesar Reclamo (`POST /api/claim`)
* **Uso:** Realiza la transferencia de premios / incentivos al partner directamente invocando `claim_prize` en Soroban.
* **Cuerpo (JSON):**
  ```json
  {
    "studentWallet": "GB2Z4633MOCKSTUDENTWALLETADDRESSXYZ77777",
    "partnerId": 101,
    "amount": "10000000"
  }
  ```

---

## 4. Despliegue en Vercel (Producción)
Para volver a desplegar la consola visual y las funciones serverless de la API, ejecuta:
```bash
# Despliegue en entorno de producción
npx vercel --prod --yes
```

Las variables de entorno esenciales como `API_SECRET_TOKEN`, `ESCROW_CONTRACT_ID` y `ADMIN_PUBLIC_KEY` deben configurarse en el panel del proyecto en vercel.com para el correcto procesamiento de firmas.
