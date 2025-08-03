import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tableId = searchParams.get('id')
  
  if (!tableId) {
    return NextResponse.json({ error: 'Table ID required' }, { status: 400 })
  }
  
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://primo-poker-server.alabamamike.workers.dev'
    const response = await fetch(`${apiUrl}/api/tables/${tableId}`)
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: `Backend returned ${response.status}`,
        statusText: response.statusText 
      }, { status: response.status })
    }
    
    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Failed to fetch table',
      details: error.message 
    }, { status: 500 })
  }
}