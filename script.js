const puppeteer = require('puppeteer');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Variáveis globais para preenchimento
const DADOS_FORMULARIO = {
  login: 'usuario',
  senha: 'mestra',
  projeto: '68',
  modulo: 'Férias',
  solicitacao: '',
  atividade: 'Férias',
  horas: '08:00',
  descricao: 'Férias' 
};

// Função de delay alternativa para versões mais antigas do Puppeteer
function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    });
    
    let timesheetPage;

    try {
        const page = await browser.newPage();
        
        // 1. Fazer login
        console.log('Acessando página de login...');
        await page.goto('https://www.mestrainfo.com.br/soljava/index.asp', { 
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        
        await page.$eval('input[name="login"]', (el, value) => el.value = value, 'lucasbarbosa');
        await page.$eval('input[name="senha"]', (el, value) => el.value = value, 'mestra');
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.evaluate(() => document.querySelector('input[type="submit"][value="Entrar"]').click())
        ]);
        
        // 2. Selecionar projeto
        console.log('Selecionando projeto...');
        await page.waitForSelector('select[name="projetos"]', { timeout: 10000 });
        
        await page.$eval('select[name="projetos"]', (el, value) => {
            el.value = value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }, '68');
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.$eval('button[type="submit"] .glyphicon-ok', el => el.click())
        ]);
        
        // 3. Acessar Timesheet
        console.log('Preparando para acessar Timesheet...');
        await page.$eval('#menuList a[href="tabela.asp"]', el => el.removeAttribute('target'));
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.click('#menuList a[href="tabela.asp"]')
        ]);
        
        timesheetPage = page;
        console.log('Navegação realizada com sucesso! URL:', timesheetPage.url());
        
        // 4. Selecionar mês
        console.log('Procurando seletor de meses...');
        await timesheetPage.waitForSelector('#mes, select[onchange*="mes"]', { 
            visible: true,
            timeout: 10000
        });
        
        const monthOptions = await timesheetPage.$$eval('#mes option, select[onchange*="mes"] option', options => 
            options.map(option => ({
                value: option.value,
                text: option.textContent.trim()
            }))
        );
        
        console.log('\nOpções de mês disponíveis:');
        monthOptions.forEach((option, index) => {
            if (index > 0) {
                console.log(`${index}. ${option.text} (${option.value})`);
            }
        });
        
        const choice = await new Promise(resolve => {
            readline.question('\nDigite o número correspondente ao mês desejado: ', answer => {
                resolve(answer);
            });
        });
        
        const selectedIndex = parseInt(choice);
        if (selectedIndex >= 1 && selectedIndex < monthOptions.length) {
            const selectedValue = monthOptions[selectedIndex].value;
            
            console.log(`Selecionando mês ${monthOptions[selectedIndex].text}...`);
            await timesheetPage.select('#mes, select[onchange*="mes"]', selectedValue);
            
            console.log('Identificando dias úteis...');
            let diasUteis = getDiasUteisDoMes(selectedValue);
                
            console.log(`Dias úteis encontrados: ${diasUteis.length}`);
            console.log(diasUteis);
            
            if (diasUteis.length > 0) {
                let index = 1;
                for (const diaUtil of diasUteis) {
                    console.log(`Processando dia ${diaUtil.dia}...`);
                    
                    try {
                        // Abrir o formulário
                        await timesheetPage.click('#btn1');
                        
                        // Esperar pelo formulário - versão mais robusta
                        try {
                            await timesheetPage.waitForFunction(() => {
                                const form = document.querySelector('input[name="data-1"]');
                                return form && form.offsetParent !== null;
                            }, { timeout: 10000 });
                        } catch (e) {
                            throw new Error('Formulário não apareceu após 10 segundos');
                        }
                        
                        // Delay alternativo
                        await delay(1000);
                        
                        // Preencher formulário com verificação
                        await fillFormSafely(timesheetPage, diaUtil, DADOS_FORMULARIO, index);
                        index++;
                        // Salvar e esperar
                        await delay(1500);
                       
                    } catch (error) {
                        console.log(`Erro ao processar dia ${diaUtil.dia}:`, error.message);
                        await handleFormError(timesheetPage, diaUtil);
                    }
                }

// Solução mais simples e direta para seu caso específico
await timesheetPage.evaluate(() => {
  // Encontra o botão que tem a função gravaRegistros() no onclick
  const btnGravar = document.querySelector('button[onclick="gravaRegistros()"]');
  
  if (btnGravar) {
    btnGravar.click();
  } else {
    // Fallback: Executa a função diretamente se o botão não for encontrado
    if (typeof gravaRegistros === 'function') {
      gravaRegistros();
    }
  }
});                  
                        
                console.log('Processo concluído com sucesso!');
            } else {
                console.log('Nenhum dia útil encontrado para preenchimento.');
            }
        } else {
            console.log('Opção inválida. Nenhum mês foi selecionado.');
        }
        
    } catch (error) {
        console.error('Erro durante a execução:', error.message);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        if (timesheetPage) {
            await timesheetPage.screenshot({ path: `error-${timestamp}.png` });
        }
        console.log(`Screenshot salvo como error-${timestamp}.png`);
    } finally {
                                await delay(1000);

        readline.close();
        await browser.close();
    }
})();

// Função específica para preencher o campo de data
async function preencherCampoData(page, selector, dataCompleta) {
    // Formato esperado: DDMMYYYY (ex: "03032025" para 03/03/2025)
    const dia = dataCompleta.substring(0, 2);
    const mes = dataCompleta.substring(2, 4);
    const ano = dataCompleta.substring(4, 8);

    // Foca no campo e limpa qualquer valor existente
    await page.focus(selector);
    await page.evaluate(selector => {
        const campo = document.querySelector(selector);
        campo.value = '';
        campo.dispatchEvent(new Event('input', { bubbles: true }));
    }, selector);

    // Simula a digitação do dia
    await page.keyboard.type(dia, { delay: 100 });
    
    // Simula a digitação do mês
    await page.keyboard.type(mes, { delay: 100 });
    
    // Simula a digitação do ano
    await page.keyboard.type(ano, { delay: 100 });

    // Dispara eventos para garantir que a data foi registrada
    await page.evaluate(selector => {
        const campo = document.querySelector(selector);
        campo.dispatchEvent(new Event('change', { bubbles: true }));
        campo.dispatchEvent(new Event('blur', { bubbles: true }));
    }, selector);
}

// Modificação na função fillFormSafely
async function fillFormSafely(page, diaUtil, dados, index) {
    let id = index;
    // Primeiro preenche a data separadamente
    try {
        await page.waitForSelector('input[name="data-'+id+'"]', { visible: true, timeout: 5000 });
        await preencherCampoData(page, 'input[name="data-'+id+'"]', diaUtil.dataCompleta);
    } catch (e) {
        throw new Error(`Falha ao preencher campo de data: ${e.message}`);
    }

    // Depois preenche os demais campos normalmente
    const outrosCampos = [
        { selector: 'select[name="projeto-'+id+'"]', value: dados.projeto, type: 'select' },
        { selector: 'input[name="modulo-'+id+'"]', value: dados.modulo, type: 'input' },
        { selector: 'input[name="solicitacao-'+id+'"]', value: dados.solicitacao, type: 'input' },
        { selector: 'input[name="atividade-'+id+'"]', value: dados.atividade, type: 'input' },
        { selector: 'input[name="hh-'+id+'"]', value: dados.horas, type: 'input' },
        { selector: 'input[name="Descricao-'+id+'"]', value: dados.descricao, type: 'input' }
    ];

    for (const field of outrosCampos) {
        try {
            await page.waitForSelector(field.selector, { visible: true, timeout: 5000 });
            
            if (field.type === 'select') {
                await page.select(field.selector, field.value);
            } else {
                await page.focus(field.selector);
                await page.evaluate((selector, value) => {
                    document.querySelector(selector).value = value;
                }, field.selector, field.value);
            }
            
            await delay(100);
        } catch (e) {
            throw new Error(`Falha ao preencher campo ${field.selector}: ${e.message}`);
        }
    }
    
    console.log(`Formulário preenchido para dia ${diaUtil.dia}`);
}

// Função para lidar com erros no formulário
async function handleFormError(page, diaUtil) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
        // await page.screenshot({ path: `error-day-${diaUtil.dia}-${timestamp}.png` });
        const formHtml = await page.evaluate(() => document.body.innerHTML);
        // require('fs').writeFileSync(`form-error-${diaUtil.dia}-${timestamp}.html`, formHtml);
        console.log(`Screenshot e HTML salvos para análise (dia ${diaUtil.dia})`);
        
        // Tentar fechar o formulário
        try {
            await page.click('#btn2');
            await delay(500);
        } catch (e) {
            console.log('Não foi possível fechar o formulário');
        }
    } catch (e) {
        console.log('Falha ao salvar informações de erro:', e.message);
    }
}

function getDiasUteisDoMes(yyyymm) {
    const ano = parseInt(yyyymm.substring(0, 4), 10);
    const mes = parseInt(yyyymm.substring(4, 6), 10) - 1;
    const diasUteis = [];

    const data = new Date(ano, mes, 1);

    while (data.getMonth() === mes) {
        const diaSemana = data.getDay();
        if (diaSemana >= 1 && diaSemana <= 5) {
            const dia = String(data.getDate()).padStart(2, '0');
            const mesFormatado = String(data.getMonth() + 1).padStart(2, '0');
            const anoFormatado = data.getFullYear();
            diasUteis.push({
                dia: dia,
                dataCompleta: `${dia}${mesFormatado}${anoFormatado}`
            });
        }
        data.setDate(data.getDate() + 1);
    }

    return diasUteis;
}