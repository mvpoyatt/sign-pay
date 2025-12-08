import { useEffect, useState } from 'react';
import { SupportedChainId } from './wagmi';
import {
  Connector,
  useConnect,
  useConnectors,
  useConnection,
  useDisconnect,
  useReadContract
} from 'wagmi';
import { erc20Abi } from 'viem';

export type WalletOptionsProps = {
  chainId: SupportedChainId
  tokenAddress: `0x${string}`
};

export function WalletOptions({
  chainId,
  tokenAddress,
}: WalletOptionsProps) {
  const connectors = useConnectors()
  const connect = useConnect()
  const disconnect = useDisconnect()
  const { address, connector: activeConnector, chain } = useConnection()

  // Fetch ERC-20 token data for display
  const { data: tokenBalance, isLoading: isLoadingBalance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chainId,
    query: { enabled: !!address }
  })

  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'symbol',
    chainId: chainId,
  })

  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'decimals',
    chainId: chainId,
  })

  const { data: tokenName } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'name',
    chainId: chainId,
  })

  const balance = (tokenBalance !== undefined && tokenDecimals !== undefined && tokenSymbol !== undefined)
    ? { value: tokenBalance as bigint, decimals: tokenDecimals as number, symbol: tokenSymbol as string }
    : undefined

  if (connectors.length === 0) {
    return <div>No wallets available. Please install a browser wallet to proceed.</div>
  }

  const handleConnectorClick = (connector: Connector) => {
    // If clicking on a different connector while already connected, disconnect first
    if (activeConnector && activeConnector.uid !== connector.uid) {
      disconnect.mutate(undefined, {
        onSuccess: () => {
          connect.mutate({ connector })
        }
      })
    } else if (!activeConnector) {
      // Not connected, just connect
      connect.mutate({ connector })
    }
    // If clicking the same connector, do nothing (already connected)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      { connectors.map((connector) => {
        const isConnected = activeConnector?.uid === connector.uid
        return (
          <WalletOption
            key={connector.uid}
            connector={connector}
            isConnected={isConnected}
            chain={isConnected ? chain : undefined}
            tokenName={isConnected ? (tokenName as string | undefined) : undefined}
            balance={isConnected ? balance : undefined}
            isLoadingBalance={isConnected ? isLoadingBalance : false}
            onClick={() => handleConnectorClick(connector)}
          />
        )
      })}
    </div>
  )
}

function WalletOption({
  connector,
  isConnected,
  chain,
  tokenName,
  balance,
  isLoadingBalance,
  onClick,
}: {
  connector: Connector
  isConnected: boolean
  chain?: { id: number; name: string } | undefined
  tokenName?: string | undefined
  balance?: { value: bigint; decimals: number; symbol: string } | undefined
  isLoadingBalance: boolean
  onClick: () => void
}) {
  const [ready, setReady] = useState(false)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    (async () => {
      const provider = await connector.getProvider()
      setReady(!!provider)
    })()
  }, [connector])

  return (
    <button
      style={{
        backgroundColor: isHovering ? '#111827' : '#1f2937',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        paddingTop: '0.75rem',
        paddingBottom: '0.75rem',
        color: 'white',
        cursor: isHovering ? 'pointer' : 'default'
      }}
      disabled={!ready}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1.25rem', width: '100%' }}>
        <img
          src={connector.icon}
          alt={connector.name}
          style={{ width: '2rem', height: '2rem', objectFit: 'contain' }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div>{connector.name}</div>
          {isConnected && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', fontSize: '0.875rem', color: '#d1d5db' }}>
              <div>Connected to {tokenName || 'token'} on {chain?.name}</div>
              {isLoadingBalance ? (
                <div>Loading balance...</div>
              ) : balance ? (
                <div>Balance: {(Number(balance.value) / 10 ** balance.decimals).toFixed(4)} {balance.symbol}</div>
              ) : null}
            </div>
          )}
        </div>
      </div>

    </button>
  )
}
