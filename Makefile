.PHONY: dev prod build clean

build:
	npm run build

dev: build
	node dev.js

prod: build
	npx electron .

clean:
	if exist dist rmdir /s /q dist
	if exist node_modules rmdir /s /q node_modules
