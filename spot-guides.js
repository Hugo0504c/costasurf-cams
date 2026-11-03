// Spot guides shown on spot.html (Spanish).
// Each spot: summary fields, desc (paragraphs), condiciones (when it works), peligros, acceso,
// servicios, consejos (lists), escuelas (HTML) and cercanos (ids of nearby spots).

const SCHOOL_LINK = 'style="color:var(--color-black); font-weight:600; text-decoration:underline;"';

window.SPOT_GUIDES = {
    labels: {
        title: 'Guía del Spot',
        tipo: 'Tipo', fondo: 'Fondo', nivel: 'Nivel', afluencia: 'Afluencia',
        ola: 'Ola', swell: 'Mejor mar de fondo', viento: 'Viento ideal', temporada: 'Mejor época',
        condiciones: 'Cuándo funciona',
        c_swell: 'Mar de fondo', c_viento: 'Viento', c_marea: 'Marea', c_tamano: 'Tamaño ideal', c_momento: 'Mejor momento',
        peligros: 'Peligros y precauciones',
        acceso: 'Cómo llegar y aparcar',
        servicios: 'Servicios en la playa',
        consejos: 'Consejos locales',
        escuelas: 'Escuelas y alquiler',
        agua: 'Temperatura del agua y neopreno',
        normas: 'Normas en el agua',
        cercanos: 'Spots cercanos',
        aviso: 'Información orientativa. El mar cambia cada día: comprueba siempre las condiciones en la playa y no entres si no te ves seguro.'
    },
    // Mediterranean (Málaga). A spot can bring its own table with an `agua` field (El Palmar: Atlantic).
    agua: [
        ['Invierno (dic–mar)', '14–16 °C', 'Neopreno 4/3 mm; escarpines si eres friolero'],
        ['Primavera (abr–jun)', '16–20 °C', 'Neopreno 3/2 mm'],
        ['Verano (jul–sep)', '20–25 °C', 'Licra o shorty. Ojo: con poniente el agua puede bajar de golpe a 16–18 °C'],
        ['Otoño (oct–nov)', '18–21 °C', 'Neopreno 3/2 o 2 mm']
    ],
    normas: [
        'La prioridad es del surfista que está más cerca del pico (donde rompe la ola).',
        'No te saltes la ola de otro ni remes por delante de quien ya la está surfeando.',
        'Para volver al pico, rema por donde no rompe, no por el medio de la ola.',
        'Nunca sueltes la tabla: con gente alrededor puede hacer mucho daño.',
        'En temporada de baño (aprox. junio–septiembre) muchas playas restringen el surf en las zonas balizadas para bañistas. Consulta la normativa del ayuntamiento y usa los canales habilitados.'
    ],
    spots: {
        misericordia: {
            tipo: 'Beach Break', fondo: 'Arena', nivel: 'Todos los niveles', afluencia: 'Alta (Urbana)',
            ola: 'Picos de derechas e izquierdas cortas', swell: 'Levante (E–SE)', viento: 'Terral (N–NO) o sin viento', temporada: 'Otoño a primavera',
            desc: [
                'Una de las playas más céntricas de Málaga y el spot de referencia de los surfistas de la capital. Necesita temporales fuertes de Levante o temporales de Poniente profundos para funcionar bien. Al estar en plena ciudad, en cuanto hay olas se llena rápidamente de surfistas locales.',
                'Es una playa larga y ancha, en el oeste de la ciudad junto a la histórica Chimenea de los Guindos, con varios bancos de arena repartidos a lo largo de la orilla. Los picos cambian de sitio según cómo se mueva la arena tras cada temporal, así que merece la pena darse un paseo por el paseo marítimo antes de meterse para elegir el que mejor rompe.'
            ],
            condiciones: {
                swell: 'Levante del E–SE, mejor si viene de un temporal de varios días. También entra con Poniente del SO muy fuerte.',
                viento: 'Terral (norte) o calma. Con el Levante soplando de lleno la ola se rompe y se pica.',
                marea: 'Poco relevante: en el Mediterráneo la marea apenas varía unos centímetros.',
                tamano: 'De 0,6 a 1,5 m. Con más tamaño cierra mucho y cuesta pasar la rompiente.',
                momento: 'Justo cuando amaina el Levante y queda mar de fondo, o a primera hora antes de que entre la brisa.'
            },
            peligros: [
                'Corrientes de retorno junto a los espigones cuando hay temporal.',
                'Mucha gente en el agua los días buenos: cuidado con tablas sueltas.',
                'Rompiente de orilla (shore break) con mar grande: entra y sal con cuidado.'
            ],
            acceso: [
                'Por el Paseo Marítimo Antonio Banderas, con carril bici desde el centro.',
                'Aparcamiento en las calles cercanas; complicado en verano y fines de semana.',
                'Varias líneas de autobús urbano conectan con el centro de Málaga.'
            ],
            servicios: [
                'Duchas y lavapiés a lo largo del paseo.',
                'Chiringuitos y restaurantes junto a la playa.',
                'Socorrismo en temporada de baño.'
            ],
            consejos: [
                'Mira la cámara antes de salir de casa: en cuanto entra el mar, el pico se llena en una hora.',
                'Los días pequeños son perfectos para longboard y para aprender.',
                'Si está muy lleno, camina hacia los extremos de la playa: suele haber picos con menos gente.',
                'Respeta a los locales y a las escuelas, que trabajan en la misma playa.'
            ],
            escuelas: `En la misma playa imparten clases y alquilan material <a href="https://www.instagram.com/costadelsurf_/" target="_blank" ${SCHOOL_LINK}>Costa del Surf</a> y <a href="https://www.instagram.com/latermicasurf/" target="_blank" ${SCHOOL_LINK}>La Térmica Surf</a>.`,
            cercanos: ['malagueta', 'alamos', 'bajondillo']
        },
        fuengirola: {
            tipo: 'Beach Break', fondo: 'Arena', nivel: 'Iniciación / Intermedio', afluencia: 'Media',
            ola: 'Olas cortas y manejables', swell: 'Levante (E)', viento: 'Terral (N–NO) o sin viento', temporada: 'Otoño e invierno',
            desc: [
                'La zona de Los Boliches y el puerto ofrecen olas de recorrido corto y divertido con Levante. Es un spot bastante noble, ideal para principiantes y longboarders cuando el mar no está muy picado.',
                'Fuengirola tiene un paseo marítimo larguísimo y muchos servicios, lo que la convierte en una buena opción para ir con familia o amigos que no surfean. Cuando la Bahía de Málaga está demasiado grande o desordenada, aquí suele haber olas más suaves.'
            ],
            condiciones: {
                swell: 'Levante del este. Necesita un temporal con cierta fuerza para que llegue con tamaño.',
                viento: 'Terral o calma. El Levante fuerte pica mucho el agua.',
                marea: 'Poco relevante (Mediterráneo).',
                tamano: 'De 0,5 a 1,2 m.',
                momento: 'A primera hora, antes de que entre la brisa de mar de mediodía.'
            },
            peligros: [
                'Espigón y bocana del puerto: no surfees cerca de la entrada de barcos.',
                'Bañistas en la orilla, incluso fuera de verano.',
                'Corrientes junto a los espigones con mar grande.'
            ],
            acceso: [
                'Cercanías C1 (Málaga–Fuengirola): estación de Los Boliches, a pocos minutos andando de la playa.',
                'Aparcamientos públicos y zona azul cerca del paseo marítimo.',
                'Paseo marítimo continuo para ir andando o en bici entre las distintas playas.'
            ],
            servicios: [
                'Duchas y lavapiés.',
                'Muchos chiringuitos, cafeterías y restaurantes.',
                'Socorrismo en temporada de baño.'
            ],
            consejos: [
                'Buen sitio para dar tus primeras olas en verde sin agobios de gente.',
                'Un longboard o una tabla con volumen te harán sacar mucho más partido a las olas pequeñas.',
                'Combínalo con una visita al Castillo Sohail, al otro lado de la ciudad.'
            ],
            escuelas: 'Varias opciones de alquiler de SUP y surf cerca del Puerto Deportivo y el paseo marítimo.',
            cercanos: ['malapesquera', 'cabopino']
        },
        // Playa Fuente de la Salud (id kept as 'malapesquera': see SPOTS in common.js)
        malapesquera: {
            tipo: 'Beach Break', fondo: 'Arena', nivel: 'Iniciación / Todos los niveles', afluencia: 'Alta (urbana)',
            ola: 'Olas suaves sobre arena de pendiente suave', swell: 'Levante (E–SE)', viento: 'Terral (N–NO) o sin viento', temporada: 'Otoño a primavera',
            desc: [
                'Playa urbana de Benalmádena Costa, justo al este de Puerto Marina, entre el espigón del puerto y La Carihuela de Torremolinos. Es la playa que se ve en la webcam, colgada en Puerto Marina mirando hacia Torremolinos.',
                'Es una playa ancha de arena que entra en el agua con poca pendiente, así que las olas suelen romper suaves: buena para aprender y para longboard. Mira al este-sudeste, de modo que recibe el Levante de lleno, mientras que el puerto la protege del Poniente que entra por el oeste.'
            ],
            condiciones: {
                swell: 'Levante del E–SE, que entra de frente. Con Poniente queda a la sombra del puerto y casi no llega mar.',
                viento: 'Terral (norte o noroeste) o calma. Con el Levante soplando fuerte el agua se pica.',
                marea: 'Poco relevante (Mediterráneo).',
                tamano: 'De 0,5 a 1,5 m. Con más tamaño cierra en la orilla.',
                momento: 'Cuando amaina un temporal de Levante y queda mar de fondo, a primera hora antes de que entre la brisa.'
            },
            peligros: [
                'No te acerques al espigón ni a la bocana de Puerto Marina: rocas y entrada y salida de barcos.',
                'Muchos bañistas en verano: respeta las zonas balizadas.',
                'Corrientes junto al espigón cuando hay mar grande.'
            ],
            acceso: [
                'En Benalmádena Costa, junto a Puerto Marina (zona de la calle Fragata y la avenida del Puerto Deportivo).',
                'Aparcamiento de pago en Puerto Marina y plazas en las calles cercanas; difícil en verano.',
                'Cercanías C1 (Málaga–Fuengirola): desde la estación, a pie o en autobús hasta el puerto.'
            ],
            servicios: [
                'Chiringuitos y beach clubs a lo largo de la playa, y toda la restauración de Puerto Marina.',
                'Duchas y, en temporada de baño, socorrismo.'
            ],
            consejos: [
                'Los días de Levante, compara la webcam con las de Torremolinos y La Misericordia para ver dónde está más ordenado.',
                'Con olas pequeñas, un longboard o una tabla con volumen te dará mucho más juego.',
                'Mira la normativa de temporada de baño: en verano el surf suele quedar limitado a zonas concretas.'
            ],
            escuelas: `La escuela más cercana está al otro lado del puerto, en la playa de Malapesquera: el <a href="https://www.instagram.com/clublamardebien/" target="_blank" ${SCHOOL_LINK}>Club La Mar de Bien</a>, con clases y alquiler de tablas.`,
            cercanos: ['bajondillo', 'alamos', 'fuengirola']
        },
        malagueta: {
            tipo: 'Beach Break', fondo: 'Arena', nivel: 'Iniciación', afluencia: 'Baja para surf, Alta para bañistas',
            ola: 'Orillera y suave', swell: 'Levante muy grande (E–SE)', viento: 'Terral o sin viento', temporada: 'Invierno, en temporales fuertes',
            desc: [
                'No es la playa más habitual para surfear, ya que necesita un oleaje de Levante masivo para que entre bien. Sin embargo, cuando cuadra, ofrece olas resguardadas perfectas para tablones y corchopanes.',
                'Es la playa del centro de Málaga, a un paso del puerto, Muelle Uno y el casco histórico. Los días que funciona es un plan perfecto: surf por la mañana y tapeo en el centro después.'
            ],
            condiciones: {
                swell: 'Solo con temporales de Levante grandes, cuando las demás playas de la bahía están muy grandes.',
                viento: 'Terral o calma.',
                marea: 'Poco relevante (Mediterráneo).',
                tamano: 'Le llega poca ola: de 0,4 a 1 m cuando el resto de playas tiene bastante más.',
                momento: 'En pleno temporal, cuando otras playas están desbordadas.'
            },
            peligros: [
                'Muchos bañistas, incluso en invierno: extrema la precaución.',
                'Rompiente de orilla con poca agua.',
                'Proximidad del puerto: no te acerques a la zona de navegación.'
            ],
            acceso: [
                'A pie desde el centro de Málaga en 10–15 minutos.',
                'Aparcamientos públicos de pago cerca del puerto y del paseo.',
                'Muy bien comunicada en autobús urbano.'
            ],
            servicios: [
                'Duchas, chiringuitos y restaurantes.',
                'Socorrismo en temporada de baño.',
                'Alquiler de SUP en la zona de Muelle Uno.'
            ],
            consejos: [
                'Si en La Misericordia está demasiado grande, aquí puede estar perfecto para longboard.',
                'Ideal para un primer contacto con el surf con olas muy suaves.',
                'Fuera de los días de temporal, es mejor plan para SUP que para surf.'
            ],
            escuelas: 'Alquiler de SUP disponible en el Muelle Uno y paseo.',
            cercanos: ['misericordia', 'benajarafe']
        },
        bajondillo: {
            tipo: 'Beach Break', fondo: 'Arena', nivel: 'Intermedio', afluencia: 'Media / Alta',
            ola: 'Picos rápidos con rompiente cerca de la orilla', swell: 'Levante (E–SE)', viento: 'Terral (N–NO)', temporada: 'Otoño e invierno',
            desc: [
                'Olas con fuerza cuando entra el temporal de Levante. Es una playa muy expuesta, por lo que el viento a veces ensucia la ola, pero ofrece picos rápidos y divertidos para tabla corta.',
                'Es la playa que queda bajo el centro de Torremolinos, separada por espigones en pequeñas calas de arena. Esos espigones ayudan a formar bancos de arena y a que la ola rompa con más forma que en las playas abiertas.'
            ],
            condiciones: {
                swell: 'Levante del E–SE. Recibe el mar de forma muy directa.',
                viento: 'Terral. Con Levante soplando la ola se desordena rápido.',
                marea: 'Poco relevante (Mediterráneo).',
                tamano: 'De 0,6 a 1,5 m.',
                momento: 'A primera hora con terral o cuando el viento acaba de calmar.'
            },
            peligros: [
                'Shore break fuerte: la ola rompe cerca de la orilla con poca agua.',
                'Espigones de roca entre las calas: mantente alejado con mar grande.',
                'Corrientes junto a los espigones.'
            ],
            acceso: [
                'Cercanías C1: estación de Torremolinos y bajada a pie por la Cuesta del Tajo.',
                'Aparcamiento difícil; mejor en los parkings públicos del centro.',
                'Paseo marítimo que conecta con La Carihuela y Playamar.'
            ],
            servicios: [
                'Chiringuitos, restaurantes y duchas.',
                'Socorrismo en temporada de baño.',
                'Escuelas y alquiler en el paseo.'
            ],
            consejos: [
                'Mejor con tabla corta o evolutiva: la ola es rápida y con poco recorrido.',
                'Elige la cala donde el banco de arena esté mejor formado: cambia tras cada temporal.',
                'No es la mejor opción para aprender por el shore break.'
            ],
            escuelas: 'Escuelas y alquileres disponibles en el paseo de Torremolinos.',
            cercanos: ['alamos', 'malapesquera', 'misericordia']
        },
        alamos: {
            tipo: 'Beach Break', fondo: 'Arena', nivel: 'Todos los niveles', afluencia: 'Alta',
            ola: 'Olas maniobrables y abiertas', swell: 'Levante (E) y Poniente (O)', viento: 'Terral o sin viento para surf', temporada: 'Todo el año con temporal',
            desc: [
                'El epicentro del Kite y Surf de Torremolinos. Olas maniobrables con fondo de arena. Muy buen ambiente surfero, aunque hay que compartir espacio con los kiters en días de mucho viento.',
                'Está entre Torremolinos y Málaga, al lado del aeropuerto: los aviones pasan bajísimos por encima del agua, algo que forma parte de la experiencia. Es una playa amplia, con escuelas, beach clubs y un ambiente muy deportivo.'
            ],
            condiciones: {
                swell: 'Levante del este y también Poniente del oeste, lo que la hace más versátil que otras playas de la bahía.',
                viento: 'Para surf, terral o calma. Con viento fuerte el agua es de los kiters.',
                marea: 'Poco relevante (Mediterráneo).',
                tamano: 'De 0,5 a 1,5 m.',
                momento: 'A primera hora, antes de que se levante el viento y salgan los kites.'
            },
            peligros: [
                'Líneas de kite: no surfees a sotavento de los kiters ni cerca de las zonas de despegue.',
                'Corrientes con mar grande.',
                'Mucha actividad en el agua: windsurf, kite, SUP y surf a la vez.'
            ],
            acceso: [
                'Cercanías C1: estación de Los Álamos, a unos minutos andando de la playa.',
                'Más fácil aparcar que en el centro de Torremolinos, aunque se llena en verano.',
                'Muy cerca de la autovía y del aeropuerto.'
            ],
            servicios: [
                'Escuelas de surf y kite con alquiler completo.',
                'Beach clubs y chiringuitos.',
                'Socorrismo en temporada de baño.'
            ],
            consejos: [
                'Si sopla fuerte, cambia la tabla de surf por clases de kite: aquí hay de las mejores escuelas de la zona.',
                'Los días de Poniente, cuando la Bahía de Málaga no funciona, puede ser tu mejor opción.',
                'Webcam disponible en la web de La Playa Surf House.'
            ],
            escuelas: 'Múltiples escuelas de Surf y Kitesurf (ej. La Playa Surf House) con alquiler de material completo.',
            cercanos: ['bajondillo', 'misericordia', 'malapesquera']
        },
        cabopino: {
            tipo: 'Point Break / Beach Break', fondo: 'Arena / Rocas', nivel: 'Intermedio / Avanzado', afluencia: 'Alta',
            ola: 'Derechas largas junto al espigón', swell: 'Poniente (O–SO)', viento: 'Terral (N) o sin viento', temporada: 'Otoño a primavera',
            desc: [
                'Uno de los spots más bonitos y consistentes de Marbella. El espigón del puerto crea derechas muy largas y de buena calidad. Funciona excelente con Poniente fuerte. Suele llenarse de locales cuando hay previsión.',
                'La playa está junto al pequeño puerto de Cabopino y a las Dunas de Artola, un monumento natural protegido con pasarelas de madera. Es uno de los entornos más bonitos de la Costa del Sol para surfear, con un ambiente más tranquilo que las playas urbanas de Málaga.'
            ],
            condiciones: {
                swell: 'Poniente del O–SO. Es de los mejores spots de la provincia cuando entra mar del oeste.',
                viento: 'Terral o calma. Con Poniente fuerte soplando, la ola pierde calidad.',
                marea: 'Poco relevante (Mediterráneo).',
                tamano: 'De 0,7 a 2 m. Con tamaño, la derecha del espigón es para surfistas con experiencia.',
                momento: 'Cuando el Poniente amaina y queda mar de fondo ordenado.'
            },
            peligros: [
                'Rocas junto al espigón y fondo mixto: cuidado con las caídas en poca agua.',
                'Pico muy competido los días buenos: respeta a los locales.',
                'Corriente a lo largo del espigón con mar grande.'
            ],
            acceso: [
                'Por la A-7, salida de Cabopino (entre Marbella y Fuengirola).',
                'Aparcamiento junto al puerto y las dunas; de pago y lleno en verano.',
                'Autobús interurbano Marbella–Fuengirola con parada cerca.'
            ],
            servicios: [
                'Chiringuitos y restaurantes en el puerto y la playa.',
                'Socorrismo en temporada de baño.',
                'Alquiler de SUP y surf cerca del puerto.'
            ],
            consejos: [
                'Respeta las dunas: camina solo por las pasarelas, es un espacio protegido.',
                'Si no tienes nivel para la derecha del espigón, surfea los picos de arena más alejados.',
                'Webcam externa disponible en Spotfav.'
            ],
            escuelas: 'Alquiler de material de SUP y Surf en las proximidades del puerto de Cabopino.',
            cercanos: ['fuengirola', 'malapesquera']
        },
        benajarafe: {
            tipo: 'Beach Break', fondo: 'Arena oscura y grava', nivel: 'Todos los niveles', afluencia: 'Baja',
            ola: 'Orillera, picos cambiantes', swell: 'Levante (E–SE)', viento: 'Terral (N) o sin viento', temporada: 'Otoño a primavera',
            desc: [
                'Un spot mucho más salvaje y tranquilo en la Axarquía. Rompe cerca de la orilla y es perfecto si buscas huir de las masificaciones de Málaga capital o Benalmádena.',
                'Está en la costa de Vélez-Málaga, unos 20 km al este de la capital, con una playa larga y abierta y un paseo marítimo tranquilo. Al estar más al este, recibe el Levante con más tamaño que la Bahía de Málaga.'
            ],
            condiciones: {
                swell: 'Levante del E–SE, al que está muy expuesta.',
                viento: 'Terral o calma. Con Levante soplando se pica enseguida.',
                marea: 'Poco relevante (Mediterráneo).',
                tamano: 'De 0,5 a 1,3 m.',
                momento: 'Cuando amaina el Levante, con el mar de fondo todavía entrando.'
            },
            peligros: [
                'Rompiente de orilla fuerte con mar grande.',
                'Grava en la orilla: cuidado al entrar y salir.',
                'Sin socorrista fuera de la temporada de baño y poca gente alrededor: no surfees solo.'
            ],
            acceso: [
                'Por la A-7 o la N-340, salida de Benajarafe.',
                'Aparcamiento fácil junto al paseo marítimo.',
                'Autobús interurbano Málaga–Torre del Mar.'
            ],
            servicios: [
                'Chiringuitos y restaurantes en el paseo.',
                'Duchas en temporada.',
                'Pocas escuelas: lleva tu propio material.'
            ],
            consejos: [
                'Ideal para surfear con poca gente cuando la capital está llena.',
                'Lleva escarpines si te molesta la grava.',
                'Prueba el pescaíto en algún chiringuito después de la sesión.'
            ],
            escuelas: 'Pocas opciones comerciales fijas; mejor llevar material propio.',
            cercanos: ['torredelmar', 'nerja', 'malagueta']
        },
        torredelmar: {
            tipo: 'Beach Break', fondo: 'Arena oscura y grava', nivel: 'Todos los niveles', afluencia: 'Media',
            ola: 'Orillera, picos junto a los espigones', swell: 'Levante (E–SE)', viento: 'Terral (N) o sin viento', temporada: 'Otoño a primavera',
            desc: [
                'El spot de referencia de la Axarquía. Una playa larga y abierta frente al paseo marítimo de Torre del Mar, con picos de arena que cambian según el temporal y los espigones de piedra.',
                'Está en la costa de Vélez-Málaga, unos 30 km al este de la capital. Como Benajarafe, recibe el Levante con más tamaño que la Bahía de Málaga, y la webcam permite ver desde casa si la orilla está rompiendo antes de ir.'
            ],
            condiciones: {
                swell: 'Levante del E–SE, al que está muy expuesta.',
                viento: 'Terral o calma. Con Levante soplando fuerte se pica rápido.',
                marea: 'Poco relevante (Mediterráneo).',
                tamano: 'De 0,5 a 1,5 m.',
                momento: 'Cuando el Levante empieza a amainar y el mar de fondo sigue entrando, mejor a primera hora.'
            },
            peligros: [
                'Espigones de piedra: no te acerques demasiado con mar grande.',
                'Rompiente de orilla fuerte cuando hay tamaño.',
                'Grava en la orilla: cuidado al entrar y salir.'
            ],
            acceso: [
                'Por la A-7, salidas de Torre del Mar / Vélez-Málaga.',
                'Aparcamiento en las calles cercanas al paseo; difícil en verano.',
                'Autobús interurbano Málaga–Torre del Mar.'
            ],
            servicios: [
                'Paseo marítimo con chiringuitos, bares y restaurantes.',
                'Duchas y socorrismo en temporada de baño.',
                'Tiendas y servicios del pueblo a un paso.'
            ],
            consejos: [
                'Mira la webcam antes de salir: se ve toda la orilla y si está rompiendo.',
                'Fuera del verano suele haber poca gente en el agua.',
                'Lleva escarpines si te molesta la grava.'
            ],
            escuelas: 'Oferta reducida y sobre todo de SUP en verano; fuera de temporada, mejor material propio.',
            cercanos: ['benajarafe', 'nerja']
        },
        nerja: {
            tipo: 'Beach Break', fondo: 'Arena y cantos', nivel: 'Iniciación / Intermedio', afluencia: 'Baja (Surf) / Alta (Turismo)',
            ola: 'Orillera', swell: 'Levante fuerte (E–SE)', viento: 'Terral (N) o sin viento', temporada: 'Otoño e invierno',
            desc: [
                'Playa preciosa rodeada de acantilados. Entra mar con levantes fuertes. El oleaje suele ser más bien orillero, pero el entorno hace que cada baño aquí valga la pena.',
                'Burriana es la playa más grande de Nerja, a unos 20 minutos andando del Balcón de Europa. En el extremo este de la provincia, muy cerca de los Acantilados de Maro-Cerro Gordo, combina surf, kayak y uno de los paisajes más espectaculares de la costa.'
            ],
            condiciones: {
                swell: 'Levante fuerte del E–SE.',
                viento: 'Terral o calma.',
                marea: 'Poco relevante (Mediterráneo).',
                tamano: 'De 0,5 a 1,2 m.',
                momento: 'Fuera de verano y a primera hora, cuando la playa está tranquila.'
            },
            peligros: [
                'Cantos en la orilla: usa escarpines.',
                'Rompiente de orilla con mar grande.',
                'Rocas en los extremos de la playa.'
            ],
            acceso: [
                'Desde el Balcón de Europa, unos 20 minutos andando por la costa.',
                'Aparcamiento de pago junto a la playa de Burriana.',
                'Por la A-7, salidas de Nerja.'
            ],
            servicios: [
                'Chiringuitos famosos por su paella, como el de Ayo.',
                'Alquiler de kayak y SUP.',
                'Duchas y socorrismo en temporada de baño.'
            ],
            consejos: [
                'Si no hay olas, alquila un kayak o SUP y visita los Acantilados de Maro.',
                'Combina la sesión con una visita a la Cueva de Nerja.',
                'Mejor con tablas con volumen: la ola tiene poca fuerza.'
            ],
            escuelas: 'Centros de alquiler de Kayak y SUP en Burriana; algunos ofrecen tablas de surf (corchopanes).',
            cercanos: ['torredelmar', 'benajarafe']
        },

        // ── Popular spots near Málaga (SPOTS[id].near) ──
        elpalmar: {
            tipo: 'Beach Break', fondo: 'Arena', nivel: 'Todos los niveles', afluencia: 'Alta',
            ola: 'Picos de arena a lo largo de una playa abierta al Atlántico', swell: 'Atlántico del O–SO', viento: 'Levante (E) o sin viento', temporada: 'Otoño a primavera',
            desc: [
                'Uno de los spots más conocidos del sur de España. Es una playa atlántica muy larga y casi virgen en la costa de Vejer de la Frontera (Cádiz), con picos de arena repartidos a lo largo de varios kilómetros y mucha más consistencia que el Mediterráneo: con temporal, las olas pueden llegar a los tres metros.',
                'Mira al oeste-suroeste, así que recibe de lleno el mar de fondo del Atlántico. Lo que en Málaga es el viento malo, el Levante, aquí sopla desde tierra y deja la ola limpia. Está a unos 220 km de Málaga: es un plan de día completo o de fin de semana.'
            ],
            condiciones: {
                swell: 'Mar de fondo atlántico del oeste o suroeste, que entra casi todo el año fuera del verano.',
                viento: 'Levante (este) suave o calma. El Poniente sopla de mar y la estropea; con Levante muy fuerte, el viento levanta mucha arena.',
                marea: 'Sí cuenta: es el Atlántico. Los bancos de arena cambian con la marea, así que conviene mirar la tabla de mareas y probar a distintas horas.',
                tamano: 'De 0,5 a 2 m para la mayoría; con más tamaño, solo para surfistas con experiencia.',
                momento: 'Otoño, invierno y primavera. En verano las olas suelen ser pequeñas, mejor con tabla grande o longboard.'
            },
            peligros: [
                'Corrientes de retorno entre los bancos de arena, sobre todo con mar grande: si te arrastra, rema en paralelo a la orilla.',
                'Mucha gente en el agua los días buenos y en vacaciones, con escuelas en la zona de espuma: respeta las prioridades.',
                'Con mar grande la ola rompe con fuerza: no entres por encima de tu nivel.'
            ],
            acceso: [
                'Desde Málaga, por la A-7 hasta Algeciras y la N-340 hacia Vejer de la Frontera (unos 220 km).',
                'El Palmar está entre Conil y Zahora; la playa sigue toda la carretera de la costa.',
                'Aparcamiento junto a la playa; en verano se llena pronto.'
            ],
            servicios: [
                'Escuelas de surf, alquiler de material y surfcamps a lo largo de la playa.',
                'Chiringuitos, bares y alojamientos en El Palmar; tiendas y más servicios en Conil y Vejer.'
            ],
            consejos: [
                'Mira la webcam de 9 Pies antes de hacer el viaje: desde Málaga son más de dos horas.',
                'Los días de Levante, cuando en la Costa del Sol el mar está picado, aquí suele estar limpio.',
                'Si hay mucha gente, camina por la playa: es tan larga que siempre hay picos con menos gente.'
            ],
            // Atlantic: colder than Málaga, and the Levante (offshore here) brings up cold water even in summer
            agua: [
                ['Invierno (dic–mar)', '14–16 °C', 'Neopreno 4/3 mm y escarpines'],
                ['Primavera (abr–jun)', '15–18 °C', 'Neopreno 4/3 o 3/2 mm'],
                ['Verano (jul–sep)', '18–22 °C', 'Neopreno 3/2 o shorty. Ojo: con Levante el agua se enfría de golpe'],
                ['Otoño (oct–nov)', '17–20 °C', 'Neopreno 3/2 mm']
            ],
            escuelas: `Hay muchas escuelas y surfcamps en El Palmar. Una de ellas, <a href="https://www.escueladesurf9pies.com/es/webcam-el-palmar" target="_blank" ${SCHOOL_LINK}>9 Pies Escuela de Surf</a>, es la que emite la webcam del spot.`,
            cercanos: []
        }
    }
};
