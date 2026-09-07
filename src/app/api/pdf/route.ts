import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo PDF fornecido.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const data = await pdfParse(buffer);

    return NextResponse.json({ text: data.text });
  } catch (error: any) {
    console.error('Erro na extração de PDF:', error);
    return NextResponse.json({ error: 'Falha ao ler o PDF: ' + error.message }, { status: 500 });
  }
}
