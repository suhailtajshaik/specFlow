import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import nodemailer, { type Transporter } from 'nodemailer'
import { z } from 'zod'

// Email transporter
let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (!transporter) {
    const smtpConfig = {
      host: Bun.env.SMTP_HOST || 'localhost',
      port: parseInt(Bun.env.SMTP_PORT || '587'),
      secure: Bun.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: Bun.env.SMTP_USER,
        pass: Bun.env.SMTP_PASS,
      },
    }

    // If no auth provided, create a test account
    if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
      console.warn('No SMTP credentials provided, email functionality may be limited')
    }

    transporter = nodemailer.createTransporter(smtpConfig)
  }
  return transporter
}

// Validation schemas
const SendEmailSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  subject: z.string(),
  text: z.string().optional(),
  html: z.string().optional(),
  from: z.string().optional(),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  bcc: z.union([z.string(), z.array(z.string())]).optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(), // base64 encoded
    contentType: z.string().optional()
  })).optional()
}).refine(data => data.text || data.html, {
  message: "Either text or html content must be provided"
})

const SendTemplateEmailSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  template: z.string(),
  variables: z.record(z.any()).optional().default({}),
  subject: z.string(),
  from: z.string().optional()
})

// MCP Server
const server = new Server(
  {
    name: 'email-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'send_email',
        description: 'Send an email via SMTP',
        inputSchema: {
          type: 'object',
          properties: {
            to: {
              oneOf: [
                { type: 'string', format: 'email' },
                { type: 'array', items: { type: 'string', format: 'email' } }
              ],
              description: 'Recipient email address(es)'
            },
            subject: { type: 'string', description: 'Email subject' },
            text: { type: 'string', description: 'Plain text content' },
            html: { type: 'string', description: 'HTML content' },
            from: { type: 'string', format: 'email', description: 'Sender email (optional)' },
            cc: {
              oneOf: [
                { type: 'string', format: 'email' },
                { type: 'array', items: { type: 'string', format: 'email' } }
              ],
              description: 'CC recipients'
            },
            bcc: {
              oneOf: [
                { type: 'string', format: 'email' },
                { type: 'array', items: { type: 'string', format: 'email' } }
              ],
              description: 'BCC recipients'
            },
            attachments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  filename: { type: 'string' },
                  content: { type: 'string', description: 'Base64 encoded content' },
                  contentType: { type: 'string' }
                },
                required: ['filename', 'content']
              }
            }
          },
          required: ['to', 'subject'],
          anyOf: [
            { required: ['text'] },
            { required: ['html'] }
          ]
        }
      },
      {
        name: 'send_template_email',
        description: 'Send an email using a template with variable substitution',
        inputSchema: {
          type: 'object',
          properties: {
            to: {
              oneOf: [
                { type: 'string', format: 'email' },
                { type: 'array', items: { type: 'string', format: 'email' } }
              ],
              description: 'Recipient email address(es)'
            },
            template: { type: 'string', description: 'Email template name' },
            variables: { 
              type: 'object',
              additionalProperties: true,
              description: 'Variables for template substitution'
            },
            subject: { type: 'string', description: 'Email subject' },
            from: { type: 'string', format: 'email', description: 'Sender email (optional)' }
          },
          required: ['to', 'template', 'subject']
        }
      }
    ]
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'send_email': {
        const validated = SendEmailSchema.parse(args)
        return await sendEmail(validated)
      }
      
      case 'send_template_email': {
        const validated = SendTemplateEmailSchema.parse(args)
        return await sendTemplateEmail(validated)
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ]
    }
  }
})

// Tool implementations
async function sendEmail(params: z.infer<typeof SendEmailSchema>) {
  try {
    const transporter = getTransporter()
    
    // Prepare attachments
    let attachments: any[] | undefined
    if (params.attachments && params.attachments.length > 0) {
      attachments = params.attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType
      }))
    }

    const mailOptions = {
      from: params.from || Bun.env.SMTP_FROM_EMAIL || Bun.env.SMTP_USER,
      to: Array.isArray(params.to) ? params.to.join(', ') : params.to,
      cc: params.cc ? (Array.isArray(params.cc) ? params.cc.join(', ') : params.cc) : undefined,
      bcc: params.bcc ? (Array.isArray(params.bcc) ? params.bcc.join(', ') : params.bcc) : undefined,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments
    }

    const result = await transporter.sendMail(mailOptions)
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            messageId: result.messageId,
            response: result.response
          })
        }
      ]
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Email sending failed'
          })
        }
      ]
    }
  }
}

async function sendTemplateEmail(params: z.infer<typeof SendTemplateEmailSchema>) {
  try {
    // Load template
    const template = await loadTemplate(params.template)
    if (!template) {
      throw new Error(`Template '${params.template}' not found`)
    }

    // Substitute variables
    const processedTemplate = substituteVariables(template, params.variables)

    const transporter = getTransporter()
    
    const mailOptions = {
      from: params.from || Bun.env.SMTP_FROM_EMAIL || Bun.env.SMTP_USER,
      to: Array.isArray(params.to) ? params.to.join(', ') : params.to,
      subject: substituteVariables(params.subject, params.variables),
      html: processedTemplate.html,
      text: processedTemplate.text
    }

    const result = await transporter.sendMail(mailOptions)
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            messageId: result.messageId,
            response: result.response,
            template: params.template
          })
        }
      ]
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Template email sending failed'
          })
        }
      ]
    }
  }
}

// Template loading and processing
async function loadTemplate(templateName: string): Promise<{ html?: string; text?: string } | null> {
  try {
    const templateDir = Bun.env.EMAIL_TEMPLATE_DIR || '/app/templates'
    
    // Try to load HTML and text versions
    const htmlPath = `${templateDir}/${templateName}.html`
    const textPath = `${templateDir}/${templateName}.txt`
    
    const template: { html?: string; text?: string } = {}
    
    try {
      const htmlFile = await Bun.file(htmlPath)
      template.html = await htmlFile.text()
    } catch {
      // HTML template not found, continue
    }
    
    try {
      const textFile = await Bun.file(textPath)
      template.text = await textFile.text()
    } catch {
      // Text template not found, continue
    }
    
    // If neither found, return null
    if (!template.html && !template.text) {
      return null
    }
    
    return template
  } catch (error) {
    console.error('Error loading template:', error)
    return null
  }
}

function substituteVariables(template: string, variables: Record<string, any>): string {
  let result = template
  
  for (const [key, value] of Object.entries(variables)) {
    // Replace {{variable}} patterns
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
    result = result.replace(regex, String(value))
  }
  
  return result
}

// Start the server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  
  console.log('Email MCP Server running on stdio')
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down Email MCP Server...')
  if (transporter) {
    transporter.close()
  }
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('Shutting down Email MCP Server...')
  if (transporter) {
    transporter.close()
  }
  process.exit(0)
})

if (import.meta.main) {
  main().catch((error) => {
    console.error('Server error:', error)
    process.exit(1)
  })
}