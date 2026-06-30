import {
  rpc,
  Keypair,
  TransactionBuilder,
  Networks,
  Contract,
  Address,
  nativeToScVal,
  scValToNative,
  BASE_FEE
} from '@stellar/stellar-sdk';
import * as dotenv from 'dotenv';

// Carga las variables de entorno del archivo .env
dotenv.config();

// CONFIGURACIÓN DE CONEXIÓN CON LA BLOCKCHAIN STELLAR TESTNET
// URL del nodo RPC de Soroban para realizar consultas y enviar transacciones en Testnet
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
// Dirección del Smart Contract de Escrow desplegado en Soroban
const ESCROW_CONTRACT_ID = process.env.ESCROW_CONTRACT_ID || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
// Clave secreta del administrador utilizada como firmante local de respaldo
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'SBCXP...';

// Inicialización del cliente RPC de Stellar para comunicarse con la red de prueba
const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

/**
 * FUNCIÓN BLOCKCHAIN: Obtiene el Keypair del Administrador.
 * Recupera la clave secreta de las variables de entorno y genera un objeto Keypair
 * de Stellar que contiene las llaves pública y privada para firmar transacciones.
 * Si no está configurada, genera una aleatoria como simulación para evitar errores fatales.
 * 
 * @returns Keypair Objeto que representa las claves criptográficas del administrador
 */
function getAdminKeypair(): Keypair {
  if (!process.env.ADMIN_SECRET_KEY) {
    console.warn('WARNING: ADMIN_SECRET_KEY is not set in environment. Generating a random keypair for simulation.');
    return Keypair.random();
  }
  return Keypair.fromSecret(process.env.ADMIN_SECRET_KEY);
}

/**
 * FUNCIÓN BLOCKCHAIN: Registrar Partner Cultural en el Smart Contract.
 * Invoca la función `register_partner` del contrato inteligente en Soroban.
 * Esta función guarda en el almacenamiento del contrato la billetera Stellar asociada a un ID de partner.
 * Requiere la firma del Administrador del Escrow para autorizar el registro.
 * 
 * @param partnerId Identificador numérico único del comercio/partner (ej: 101 para Cine)
 * @param partnerWallet Dirección de billetera Stellar pública del partner (G...)
 * @returns Promise<string> Hash de la transacción exitosa en el ledger
 */
export async function registerPartnerOnChain(partnerId: number, partnerWallet: string): Promise<string> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Registering partner ${partnerId} with wallet ${partnerWallet} on-chain...`);

  // Instancia la representación del contrato de Soroban con su ID
  const contract = new Contract(ESCROW_CONTRACT_ID);

  // Crea la operación de llamada (call) al smart contract con sus argumentos serializados
  // Los tipos de datos se convierten al formato ScVal compatible con Soroban (u32 y Address)
  const operation = contract.call(
    'register_partner',
    nativeToScVal(partnerId, { type: 'u32' }),
    Address.fromString(partnerWallet).toScVal()
  );

  // Envía la operación construida a la blockchain usando el firmante administrador
  return await sendSorobanTransaction(adminKeypair, operation);
}

/**
 * FUNCIÓN BLOCKCHAIN: Liquidar Premio / Enviar USDC al Partner.
 * Invoca la función `claim_prize` del contrato inteligente en Soroban.
 * El contrato valida la firma del admin y transfiere USDC desde su pool de custodia
 * hacia la billetera del partner registrado que corresponda al `partnerId`.
 * 
 * @param studentWallet Dirección Stellar pública del monedero embebido del estudiante
 * @param partnerId Identificador del partner que provee el beneficio
 * @param amount Monto de USDC a transferir (expresado en su menor unidad, base de 7 decimales)
 * @returns Promise<string> Hash de la transacción confirmada
 */
export async function claimPrizeOnChain(
  studentWallet: string,
  partnerId: number,
  amount: bigint
): Promise<string> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Executing claim_prize for student ${studentWallet} at partner ${partnerId} (Amount: ${amount})`);

  // Instancia la representación del contrato inteligente
  const contract = new Contract(ESCROW_CONTRACT_ID);

  // Construye la operación de llamada traduciendo los parámetros nativos a ScVal
  // claim_prize(student_wallet: Address, partner_id: u32, amount: i128)
  const operation = contract.call(
    'claim_prize',
    Address.fromString(studentWallet).toScVal(),
    nativeToScVal(partnerId, { type: 'u32' }),
    nativeToScVal(amount, { type: 'i128' })
  );

  // Envía la operación a la blockchain y retorna el hash de confirmación
  return await sendSorobanTransaction(adminKeypair, operation);
}

/**
 * FUNCIÓN AUXILIAR BLOCKCHAIN: Procesamiento Completo de Transacciones Soroban.
 * Realiza el flujo estándar exigido por Stellar para enviar operaciones de escritura en Soroban:
 * 1. Obtiene la secuencia (nonce) actual de la cuenta origen en la red Stellar.
 * 2. Construye una transacción preliminar con una comisión base.
 * 3. Envía la transacción a simulación en el nodo RPC para calcular el Footprint de Ledger
 *    (claves de almacenamiento que lee/escribe el contrato) y calcular las comisiones de gas reales.
 * 4. Ensambla los resultados de la simulación de vuelta en la transacción final.
 * 5. Firma criptográficamente la transacción con la clave privada del firmante.
 * 6. Envía la transacción firmada a la red a través del RPC.
 * 7. Realiza un bucle de consulta (polling) para esperar que el ledger cierre y confirme el estado SUCCESS.
 * 
 * @param signer Keypair de la cuenta que paga y firma la transacción (Administrador)
 * @param operation La operación de llamada al contrato que se desea ejecutar
 * @returns Promise<string> Hash final de la transacción confirmada en el Ledger
 */
async function sendSorobanTransaction(signer: Keypair, operation: any): Promise<string> {
  try {
    // 1. Obtiene los detalles de la cuenta origen (necesario para la secuencia/nonce)
    const sourceAccount = await rpcServer.getAccount(signer.publicKey());

    // 2. Construye la estructura base de la transacción
    let tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // 3. Simulación Soroban (requerida para determinar el footprint de almacenamiento y recursos)
    console.log('[StellarPay] Simulating transaction...');
    const simulation = await rpcServer.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(simulation)) {
      console.log('[StellarPay] Simulation success. Assembling transaction...');
      // 4. Incorpora el footprint de lectura/escritura y las tasas estimadas en la transacción
      tx = rpc.assembleTransaction(tx, simulation).build();
    } else {
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.error)}`);
    }

    // 5. Firma criptográfica de la transacción de forma local
    tx.sign(signer);

    // 6. Envío de la transacción firmada al nodo RPC
    console.log('[StellarPay] Submitting transaction to Testnet RPC...');
    const sendTxResponse = await rpcServer.sendTransaction(tx);

    if (sendTxResponse.status === 'ERROR') {
      throw new Error(`Send transaction failed: ${JSON.stringify(sendTxResponse.errorResult)}`);
    }

    const txHash = sendTxResponse.hash;
    console.log(`[StellarPay] Transaction submitted successfully. Hash: ${txHash}`);

    // 7. Espera activa (polling) por la resolución de la transacción en el Ledger
    console.log('[StellarPay] Waiting for transaction resolution...');
    let getTxResponse = await rpcServer.getTransaction(txHash);
    let attempts = 0;
    
    // Consulta cada 2 segundos hasta encontrar la transacción o agotar intentos
    while (getTxResponse.status === 'NOT_FOUND' && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      getTxResponse = await rpcServer.getTransaction(txHash);
      attempts++;
    }

    // Valida si la transacción fue cerrada exitosamente en un bloque (Ledger)
    if (getTxResponse.status === 'SUCCESS') {
      console.log(`[StellarPay] Transaction successfully included in ledger! Result:`, getTxResponse.resultXdr);
      return txHash;
    } else {
      throw new Error(`Transaction failed with status: ${getTxResponse.status}. Error: ${JSON.stringify(getTxResponse)}`);
    }
  } catch (error: any) {
    console.error('[StellarPay] Error sending transaction:', error);
    throw error;
  }
}

/**
 * SIMULADOR DE EVENTOS BACKEND: Escucha y Reconciliación de Canjes.
 * Simula un bucle en segundo plano que escucha eventos de canjes realizados fuera de línea
 * y los reconcilia de manera asíncrona llamando a la blockchain para realizar los desembolsos.
 */
export function startRedemptionEventListener() {
  console.log('[StellarPay] Listening for E4C backend redemption events...');
  
  setInterval(async () => {
    const shouldSimulate = Math.random() > 0.85;
    if (shouldSimulate) {
      const mockRedemption = {
        studentWallet: 'GB2Z46...MOCK_STUDENT_WALLET',
        partnerId: Math.floor(Math.random() * 5) + 100, 
        amount: BigInt(5000000) // 5 USDC
      };

      console.log(`[StellarPay] Received redemption event: Student claimed prize at Partner ID ${mockRedemption.partnerId}`);
      try {
        console.log(`[StellarPay] [MOCK] Triggering payout of ${mockRedemption.amount} to Partner ${mockRedemption.partnerId}`);
      } catch (err: any) {
        console.error('[StellarPay] Failed to process mock redemption event:', err.message);
      }
    }
  }, 10000);
}

/**
 * FUNCIÓN BLOCKCHAIN: Obtener Pasaporte Estudiantil (Lectura del Smart Contract).
 * Realiza una consulta de lectura (simulada) al contrato en Soroban para recuperar el pasaporte
 * de un alumno. Como no modifica el estado de la blockchain, se ejecuta mediante `simulateTransaction`
 * de forma completamente gratuita y sin coste de gas (gasless read).
 * 
 * @param studentWallet Dirección pública del estudiante a consultar (G...)
 * @returns Promise<{ reputation: number; challenges: number[] } | null> Detalles del pasaporte o null si no existe
 */
export async function getStudentPassportOnChain(
  studentWallet: string
): Promise<{ reputation: number; challenges: number[] } | null> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Fetching student passport for ${studentWallet} on-chain...`);

  try {
    const contract = new Contract(ESCROW_CONTRACT_ID);
    // Crea la operación get_student_passport(student: Address)
    const operation = contract.call(
      'get_student_passport',
      Address.fromString(studentWallet).toScVal()
    );

    // Inicializa la cuenta para el remitente de la simulación
    const sourceAccount = await rpcServer.getAccount(adminKeypair.publicKey());
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // Invoca la simulación de lectura. No requiere firmar la transacción ni enviarla al ledger.
    const simulation = await rpcServer.simulateTransaction(tx);

    // Si la simulación es exitosa y devuelve un valor de retorno del smart contract
    if (rpc.Api.isSimulationSuccess(simulation) && simulation.result) {
      const scVal = simulation.result.retval;
      
      // Valida si el retorno es vacío (Void / None en Rust)
      if (!scVal || scVal.switch().name === 'scvVoid' || scVal.switch().value === 0) {
        return null;
      }
      
      // Convierte el valor deserializado de Soroban (ScVal) a un objeto nativo de JavaScript
      const native = scValToNative(scVal);
      if (!native) return null;
      
      return {
        reputation: Number(native.reputation),
        challenges: (native.challenges || []).map((c: any) => Number(c))
      };
    }
    return null;
  } catch (error: any) {
    console.error('[StellarPay] Error fetching student passport:', error.message);
    return null;
  }
}

/**
 * FUNCIÓN BLOCKCHAIN: Registrar Desafío Completado.
 * Invoca la función `add_student_challenge` del contrato de Soroban para certificar
 * que un alumno ha completado un desafío escolar y sumarle reputación de forma inmutable.
 * Requiere la firma de autorización del administrador.
 * 
 * @param studentWallet Dirección pública Stellar del estudiante
 * @param challengeId Identificador único del desafío
 * @param reputationBoost Puntos de reputación a otorgar
 * @returns Promise<string> Hash de la transacción confirmada en el ledger
 */
export async function addStudentChallengeOnChain(
  studentWallet: string,
  challengeId: number,
  reputationBoost: number
): Promise<string> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Registering challenge ID ${challengeId} (Boost: ${reputationBoost}) for student ${studentWallet}`);

  const contract = new Contract(ESCROW_CONTRACT_ID);
  // add_student_challenge(student: Address, challenge_id: u32, reputation_boost: u32)
  const operation = contract.call(
    'add_student_challenge',
    Address.fromString(studentWallet).toScVal(),
    nativeToScVal(challengeId, { type: 'u32' }),
    nativeToScVal(reputationBoost, { type: 'u32' })
  );

  return await sendSorobanTransaction(adminKeypair, operation);
}

/**
 * FUNCIÓN BLOCKCHAIN: Actualizar Puntos de Reputación Directa.
 * Invoca la función `update_student_reputation` del smart contract de Soroban.
 * Permite al administrador ajustar o fijar directamente la reputación de un alumno
 * en la blockchain (por ejemplo, para otorgar bonos anuales o corregir discrepancias).
 * 
 * @param studentWallet Dirección de la billetera Stellar del alumno
 * @param reputation Nueva cantidad de puntos de reputación a asignar
 * @returns Promise<string> Hash de la transacción confirmada
 */
export async function updateStudentReputationOnChain(
  studentWallet: string,
  reputation: number
): Promise<string> {
  const adminKeypair = getAdminKeypair();
  console.log(`[StellarPay] Directly updating reputation to ${reputation} for student ${studentWallet}`);

  const contract = new Contract(ESCROW_CONTRACT_ID);
  // update_student_reputation(student: Address, reputation: u32)
  const operation = contract.call(
    'update_student_reputation',
    Address.fromString(studentWallet).toScVal(),
    nativeToScVal(reputation, { type: 'u32' })
  );

  return await sendSorobanTransaction(adminKeypair, operation);
}
