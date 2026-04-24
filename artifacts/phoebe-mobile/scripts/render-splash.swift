import AppKit
import Foundation

let outputPath = CommandLine.arguments[1]
let size = NSSize(width: 2732, height: 2732)

let image = NSImage(size: size)
image.lockFocus()

NSColor(srgbRed: 0x09/255.0, green: 0x1A/255.0, blue: 0x10/255.0, alpha: 1.0).setFill()
NSRect(origin: .zero, size: size).fill()

let text = "Phoebe"
let targetWidth = size.width * 0.28

func makeFont(_ pt: CGFloat) -> NSFont {
    NSFont(name: "SpaceGrotesk-Bold", size: pt)
        ?? NSFont(name: "Space Grotesk Bold", size: pt)
        ?? NSFont.boldSystemFont(ofSize: pt)
}

let fg = NSColor(srgbRed: 0xF0/255.0, green: 0xEA/255.0, blue: 0xDC/255.0, alpha: 1.0)
var fontSize: CGFloat = 400
var font = makeFont(fontSize)
var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: fg]
var textSize = NSAttributedString(string: text, attributes: attrs).size()
fontSize = (fontSize * targetWidth / textSize.width).rounded()
font = makeFont(fontSize)
attrs = [.font: font, .foregroundColor: fg]
let attributed = NSAttributedString(string: text, attributes: attrs)
textSize = attributed.size()

attributed.draw(in: NSRect(
    x: (size.width - textSize.width) / 2,
    y: (size.height - textSize.height) / 2,
    width: textSize.width,
    height: textSize.height
))

image.unlockFocus()

guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let rep = NSBitmapImageRep(cgImage: cgImage)
let srgbRep = rep.converting(to: NSColorSpace.sRGB, renderingIntent: .default) ?? rep
guard let png = srgbRep.representation(using: .png, properties: [:]) else { exit(1) }

try png.write(to: URL(fileURLWithPath: outputPath))
print("Wrote \(outputPath) (\(png.count) bytes)")
