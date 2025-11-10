from server import mcp

# Export the FastMCP app for Vercel
app = mcp.get_asgi_app()
