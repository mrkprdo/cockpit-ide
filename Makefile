.PHONY: dev prod build clean

build:
	npm run build

dev: build
	npm run dev

prod: build
	npm run prod

clean:
	if exist dist rmdir /s /q dist
	if exist node_modules rmdir /s /q node_modules
